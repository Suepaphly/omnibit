// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title AccretiveIndex
 * @notice Clone-ready ERC-20 index share + custody vault + recognized-backing ledger.
 * @dev Product invariant: backing per share = trackedBalance[i] / totalSupply.
 *      Accretion deposits constituents WITHOUT minting so backing/share rises while totalSupply is unchanged.
 *
 *      Raw ERC-20 balanceOf is NOT recognized backing. Direct donations MUST NOT auto-track.
 *      Only seed, mintExactShares, redeem, depositAccretion, and syncLoss may mutate trackedBalance.
 *
 *      Fee-on-transfer / rebasing / blacklisting constituents are unsupported. Upstream registry
 *      (IndexFactory) is assumed to approve only standard ERC-20s with no transfer tax.
 *
 *      cumulativeAccretedUsdWad: engine passes NavLib USD-WAD of newly recognized amounts on
 *      depositAccretion (factory feeds). Display/NAV only — never affects redeem rights.
 *      Assumption: accretionEngine is trusted; stale/non-positive feeds revert in the engine before deposit.
 *
 *      mintPaused / closed are storage-reserved for a later factory/guardian; this contract has
 *      no setters for them. mintExactShares reverts when mintPaused is true.
 */
contract AccretiveIndex is Initializable, ERC20Upgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint8 public constant DECIMALS = 18;
    uint8 public constant MAX_CONSTITUENTS = 8;
    uint16 public constant MAX_BPS = 10_000;

    address[] internal _constituents;
    mapping(address => uint256) public trackedBalance;
    mapping(address => uint256) public cumulativeAccretedRaw;
    /// @dev Lifetime USD-WAD of recognized accretion (UI/NAV). Updated only via depositAccretion usdWadIncrement.
    uint256 public cumulativeAccretedUsdWad;

    address public factory;
    address public launcher;
    address public accretionEngine;
    address public protocolTreasury;

    uint16 public mintFeeBps;
    uint16 public redeemFeeBps;

    bool public seeded;
    /// @dev Reserved for factory/guardian pause. No setter in this contract.
    bool public mintPaused;
    /// @dev Reserved for factory/guardian wind-down. No setter in this contract.
    bool public closed;

    mapping(address => bool) internal _isConstituent;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error InvalidConstituentCount();
    error DuplicateConstituent();
    error ZeroConstituent();
    error InvalidFeeBps();
    error OnlyLauncher();
    error OnlyAccretionEngine();
    error AlreadySeeded();
    error NotSeeded();
    error MintPaused();
    error LengthMismatch();
    error ZeroShares();
    error ZeroReceiver();
    error NotConstituent();
    error TrackedExceedsRaw(address asset, uint256 tracked, uint256 raw);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Seeded(address indexed lpReceiver, uint256 initialGrossShares, uint256[] amounts);
    event Minted(
        address indexed caller,
        address indexed receiver,
        uint256 grossShares,
        uint256 userShares,
        uint256 feeShares,
        uint256[] requiredAssets
    );
    event Redeemed(
        address indexed caller,
        address indexed receiver,
        uint256 sharesIn,
        uint256 redeemShares,
        uint256 feeShares,
        uint256[] assetOut
    );
    event AccretionDeposited(address indexed engine, uint256[] amounts, uint256 usdWadIncrement);
    event LossSynced(address indexed asset, uint256 previousTracked, uint256 newTracked);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize a clone: ERC-20 metadata, constituents, roles, and fees.
     * @dev ReentrancyGuard (OZ v5 namespaced storage) needs no explicit init on clones:
     *      an unset status slot is treated as not-entered and is set to NOT_ENTERED after first use.
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        address[] memory constituents_,
        address factory_,
        address launcher_,
        address accretionEngine_,
        address protocolTreasury_,
        uint16 mintFeeBps_,
        uint16 redeemFeeBps_
    ) external initializer {
        if (
            factory_ == address(0) || launcher_ == address(0) || accretionEngine_ == address(0)
                || protocolTreasury_ == address(0)
        ) {
            revert ZeroAddress();
        }
        uint256 n = constituents_.length;
        if (n < 2 || n > MAX_CONSTITUENTS) revert InvalidConstituentCount();
        if (mintFeeBps_ > MAX_BPS || redeemFeeBps_ > MAX_BPS) revert InvalidFeeBps();

        __ERC20_init(name_, symbol_);

        for (uint256 i = 0; i < n; ++i) {
            address c = constituents_[i];
            if (c == address(0)) revert ZeroConstituent();
            if (_isConstituent[c]) revert DuplicateConstituent();
            _isConstituent[c] = true;
            _constituents.push(c);
        }

        factory = factory_;
        launcher = launcher_;
        accretionEngine = accretionEngine_;
        protocolTreasury = protocolTreasury_;
        mintFeeBps = mintFeeBps_;
        redeemFeeBps = redeemFeeBps_;
    }

    // -------------------------------------------------------------------------
    // ERC-20 metadata
    // -------------------------------------------------------------------------

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function constituents() external view returns (address[] memory) {
        return _constituents;
    }

    function constituentCount() external view returns (uint256) {
        return _constituents.length;
    }

    function isConstituent(address asset) external view returns (bool) {
        return _isConstituent[asset];
    }

    // -------------------------------------------------------------------------
    // Seed
    // -------------------------------------------------------------------------

    /**
     * @notice Launcher-only, one-shot seed: pull constituents from launcher, recognize tracked, mint fee-free.
     * @dev Treasury receives 0 fee shares. `initialGrossShares` must be > 0.
     */
    function seed(uint256[] calldata amounts, uint256 initialGrossShares, address lpReceiver) external nonReentrant {
        if (msg.sender != launcher) revert OnlyLauncher();
        if (seeded) revert AlreadySeeded();
        if (lpReceiver == address(0)) revert ZeroReceiver();
        if (initialGrossShares == 0) revert ZeroShares();

        uint256 n = _constituents.length;
        if (amounts.length != n) revert LengthMismatch();

        seeded = true;

        for (uint256 i = 0; i < n; ++i) {
            address asset = _constituents[i];
            uint256 amount = amounts[i];
            if (amount > 0) {
                IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
                trackedBalance[asset] = amount;
            }
            _assertTrackedLeRaw(asset);
        }

        _mint(lpReceiver, initialGrossShares);
        emit Seeded(lpReceiver, initialGrossShares, amounts);
    }

    // -------------------------------------------------------------------------
    // Mint
    // -------------------------------------------------------------------------

    /**
     * @notice In-kind mint of exact `grossShares`. Pulls ceil-pro-rata basket from caller.
     * @return userShares Shares minted to `receiver` (gross minus fee).
     * @return feeShares Shares minted to protocolTreasury.
     * @dev Does not support fee-on-transfer tokens. Assumes full `requiredAsset` arrives.
     */
    function mintExactShares(uint256 grossShares, address receiver)
        external
        nonReentrant
        returns (uint256 userShares, uint256 feeShares)
    {
        if (!seeded) revert NotSeeded();
        if (mintPaused) revert MintPaused();
        if (receiver == address(0)) revert ZeroReceiver();
        if (grossShares == 0) revert ZeroShares();

        uint256 supplyBefore = totalSupply();
        // supplyBefore cannot be 0 after a successful seed (seed mints > 0).
        (uint256[] memory required, uint256 user, uint256 fee) = _computeMint(grossShares, supplyBefore);

        uint256 n = _constituents.length;
        for (uint256 i = 0; i < n; ++i) {
            address asset = _constituents[i];
            uint256 need = required[i];
            if (need > 0) {
                IERC20(asset).safeTransferFrom(msg.sender, address(this), need);
                trackedBalance[asset] += need;
            }
            _assertTrackedLeRaw(asset);
        }

        _mint(receiver, user);
        if (fee > 0) {
            _mint(protocolTreasury, fee);
        }

        emit Minted(msg.sender, receiver, grossShares, user, fee, required);
        return (user, fee);
    }

    /**
     * @notice Preview mint arithmetic (identical to mintExactShares; no state change).
     */
    function previewMint(uint256 grossShares)
        external
        view
        returns (uint256[] memory requiredAssets, uint256 userShares, uint256 feeShares)
    {
        if (!seeded) revert NotSeeded();
        if (grossShares == 0) revert ZeroShares();
        return _computeMint(grossShares, totalSupply());
    }

    // -------------------------------------------------------------------------
    // Redeem
    // -------------------------------------------------------------------------

    /**
     * @notice In-kind redeem. Share fee transferred to treasury; remainder burned for floor-pro-rata assets.
     * @dev Works while mintPaused. Does not read any oracle/DEX.
     */
    function redeem(uint256 sharesIn, address receiver) external nonReentrant returns (uint256[] memory assetOut) {
        if (!seeded) revert NotSeeded();
        if (receiver == address(0)) revert ZeroReceiver();
        if (sharesIn == 0) revert ZeroShares();

        uint256 supplyBefore = totalSupply();
        (uint256[] memory out, uint256 redeemShares_, uint256 feeShares) = _computeRedeem(sharesIn, supplyBefore);

        if (feeShares > 0) {
            // Pull fee shares from caller to treasury (INDEX is this contract).
            _transfer(msg.sender, protocolTreasury, feeShares);
        }
        _burn(msg.sender, redeemShares_);

        uint256 n = _constituents.length;
        for (uint256 i = 0; i < n; ++i) {
            address asset = _constituents[i];
            uint256 amount = out[i];
            if (amount > 0) {
                trackedBalance[asset] -= amount;
                IERC20(asset).safeTransfer(receiver, amount);
            }
            _assertTrackedLeRaw(asset);
        }

        emit Redeemed(msg.sender, receiver, sharesIn, redeemShares_, feeShares, out);
        return out;
    }

    /**
     * @notice Preview redeem arithmetic (identical to redeem; no state change).
     */
    function previewRedeem(uint256 sharesIn)
        external
        view
        returns (uint256[] memory assetOut, uint256 redeemShares_, uint256 feeShares)
    {
        if (!seeded) revert NotSeeded();
        if (sharesIn == 0) revert ZeroShares();
        return _computeRedeem(sharesIn, totalSupply());
    }

    // -------------------------------------------------------------------------
    // Accretion
    // -------------------------------------------------------------------------

    /**
     * @notice AccretionEngine-only: pull constituents, increase tracked + cumulativeAccretedRaw, NEVER mint.
     * @param amounts Per-constituent raw amounts to recognize (worst-leg basket from harvest).
     * @param usdWadIncrement NavLib USD-WAD of `amounts` at current factory feeds (0 allowed for tests).
     * @dev cumulativeAccretedUsdWad += usdWadIncrement. Does not read oracles here — engine computes.
     */
    function depositAccretion(uint256[] calldata amounts, uint256 usdWadIncrement) external nonReentrant {
        if (msg.sender != accretionEngine) revert OnlyAccretionEngine();
        if (!seeded) revert NotSeeded();

        uint256 n = _constituents.length;
        if (amounts.length != n) revert LengthMismatch();

        for (uint256 i = 0; i < n; ++i) {
            address asset = _constituents[i];
            uint256 amount = amounts[i];
            if (amount > 0) {
                IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
                trackedBalance[asset] += amount;
                cumulativeAccretedRaw[asset] += amount;
            }
            _assertTrackedLeRaw(asset);
        }

        if (usdWadIncrement > 0) {
            cumulativeAccretedUsdWad += usdWadIncrement;
        }

        emit AccretionDeposited(msg.sender, amounts, usdWadIncrement);
    }

    // -------------------------------------------------------------------------
    // Sync loss
    // -------------------------------------------------------------------------

    /**
     * @notice Permissionless: if raw balance < tracked, set tracked = raw. Never increases tracked.
     * @dev Donations never become tracked. Required for B20 seize / unexpected balance drops.
     */
    function syncLoss(address asset) external nonReentrant {
        if (!_isConstituent[asset]) revert NotConstituent();
        uint256 tracked = trackedBalance[asset];
        uint256 raw = IERC20(asset).balanceOf(address(this));
        if (raw < tracked) {
            trackedBalance[asset] = raw;
            emit LossSynced(asset, tracked, raw);
        }
    }

    // -------------------------------------------------------------------------
    // Internal math (shared by state-changing ops and previews — no drift)
    // -------------------------------------------------------------------------

    function _computeMint(uint256 grossShares, uint256 supplyBefore)
        internal
        view
        returns (uint256[] memory required, uint256 userShares, uint256 feeShares)
    {
        uint256 n = _constituents.length;
        required = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            // requiredAsset[i] = mulDiv(tracked[i], grossShares, totalSupplyBefore, Ceil)
            required[i] = Math.mulDiv(trackedBalance[_constituents[i]], grossShares, supplyBefore, Math.Rounding.Ceil);
        }
        // feeShares = floor(grossShares * mintFeeBps / 10000)
        feeShares = (grossShares * uint256(mintFeeBps)) / uint256(MAX_BPS);
        userShares = grossShares - feeShares;
    }

    function _computeRedeem(uint256 sharesIn, uint256 supplyBefore)
        internal
        view
        returns (uint256[] memory assetOut, uint256 redeemShares_, uint256 feeShares)
    {
        feeShares = (sharesIn * uint256(redeemFeeBps)) / uint256(MAX_BPS);
        redeemShares_ = sharesIn - feeShares;

        uint256 n = _constituents.length;
        assetOut = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            // assetOut[i] = mulDiv(tracked[i], redeemShares, totalSupplyBefore, Floor)
            assetOut[i] =
                Math.mulDiv(trackedBalance[_constituents[i]], redeemShares_, supplyBefore, Math.Rounding.Floor);
        }
    }

    function _assertTrackedLeRaw(address asset) internal view {
        uint256 tracked = trackedBalance[asset];
        uint256 raw = IERC20(asset).balanceOf(address(this));
        if (tracked > raw) revert TrackedExceedsRaw(asset, tracked, raw);
    }
}
