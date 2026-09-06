// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {AccretiveIndex} from "./AccretiveIndex.sol";
import {AccretionEngine} from "../accretion/AccretionEngine.sol";

/**
 * @title IndexFactory
 * @notice Approved-asset registry + OZ Clones factory for AccretiveIndex + AccretionEngine pairs.
 * @dev createIndex is onlyLauncher. Asset approval is guardian-only.
 *
 *      Fee-on-transfer (FoT) / rebasing / blacklisting tokens are REJECTED at registry policy level:
 *      the guardian MUST NOT call approveAsset on any FoT asset. There is no on-chain FoT probe in
 *      the MVP — policy is operational. Happy-path B20 test assets are non-FoT (§5).
 *
 *      Full IndexLauncher / ZapRouter / IndexFeeHook / production UniswapV4SwapAdapter are out of
 *      this phase; factory still stores swapAdapter and marks created engines for a future adapter
 *      allowlist (isEngine).
 */
contract IndexFactory is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint8 public constant MAX_CONSTITUENTS = 8;
    uint16 public constant MAX_BPS = 10_000;
    uint16 public constant MINT_FEE_BPS = 10;
    uint16 public constant REDEEM_FEE_BPS = 10;

    address public immutable indexImplementation;
    address public immutable engineImplementation;
    address public immutable usdc;

    address public launcher;
    address public protocolTreasury;
    address public swapAdapter;

    struct AssetRecord {
        bool approved;
        address priceFeed;
    }

    mapping(address => AssetRecord) public assetRecords;

    address[] internal _indexes;
    mapping(address => bool) public isIndex;
    mapping(address => address) public engineOf; // index => engine
    mapping(address => bool) public isEngine;

    struct CreateIndexParams {
        string name;
        string symbol;
        address[] constituents;
        uint16[] initialWeightsBps;
        address creator;
    }

    error ZeroAddress();
    error OnlyLauncher();
    error InvalidConstituentCount();
    error LengthMismatch();
    error DuplicateConstituent();
    error AssetNotApproved(address asset);
    error InvalidWeights();
    error MissingPriceFeed(address asset);

    event LauncherUpdated(address indexed launcher);
    event ProtocolTreasuryUpdated(address indexed treasury);
    event SwapAdapterUpdated(address indexed adapter);
    event AssetApproved(address indexed asset, address indexed priceFeed);
    event AssetRevoked(address indexed asset);
    event PriceFeedUpdated(address indexed asset, address indexed priceFeed);
    event IndexCreated(
        address indexed index,
        address indexed accretionEngine,
        address indexed creator,
        string name,
        string symbol,
        address[] constituents,
        uint16[] initialWeightsBps
    );

    constructor(
        address indexImplementation_,
        address engineImplementation_,
        address usdc_,
        address launcher_,
        address protocolTreasury_,
        address swapAdapter_,
        address admin_
    ) {
        if (
            indexImplementation_ == address(0) || engineImplementation_ == address(0) || usdc_ == address(0)
                || launcher_ == address(0) || protocolTreasury_ == address(0) || admin_ == address(0)
        ) {
            revert ZeroAddress();
        }

        indexImplementation = indexImplementation_;
        engineImplementation = engineImplementation_;
        usdc = usdc_;
        launcher = launcher_;
        protocolTreasury = protocolTreasury_;
        swapAdapter = swapAdapter_; // MAY be address(0) until adapter is deployed

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(GUARDIAN_ROLE, admin_);
    }

    modifier onlyLauncher() {
        if (msg.sender != launcher) revert OnlyLauncher();
        _;
    }

    // -------------------------------------------------------------------------
    // Admin / guardian config
    // -------------------------------------------------------------------------

    function setLauncher(address launcher_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (launcher_ == address(0)) revert ZeroAddress();
        launcher = launcher_;
        emit LauncherUpdated(launcher_);
    }

    function setProtocolTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        protocolTreasury = treasury_;
        emit ProtocolTreasuryUpdated(treasury_);
    }

    function setSwapAdapter(address adapter_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // address(0) allowed only to clear before production adapter ships
        swapAdapter = adapter_;
        emit SwapAdapterUpdated(adapter_);
    }

    /**
     * @notice Guardian-only: approve a constituent for index creation and bind its price feed.
     * @dev POLICY: Do NOT approve fee-on-transfer, rebasing, or pausing/blacklisting tokens.
     *      FoT rejection is registry-policy (off-chain diligence), not an on-chain transfer probe.
     */
    function approveAsset(address asset, address priceFeed) external onlyRole(GUARDIAN_ROLE) {
        if (asset == address(0) || priceFeed == address(0)) revert ZeroAddress();
        assetRecords[asset] = AssetRecord({approved: true, priceFeed: priceFeed});
        emit AssetApproved(asset, priceFeed);
    }

    function setPriceFeed(address asset, address priceFeed) external onlyRole(GUARDIAN_ROLE) {
        if (priceFeed == address(0)) revert ZeroAddress();
        AssetRecord storage rec = assetRecords[asset];
        if (!rec.approved) revert AssetNotApproved(asset);
        rec.priceFeed = priceFeed;
        emit PriceFeedUpdated(asset, priceFeed);
    }

    function revokeAsset(address asset) external onlyRole(GUARDIAN_ROLE) {
        delete assetRecords[asset];
        emit AssetRevoked(asset);
    }

    // -------------------------------------------------------------------------
    // Create
    // -------------------------------------------------------------------------

    /**
     * @notice Launcher-only: clone + initialize AccretiveIndex and AccretionEngine; register pair.
     * @return index Clone address of the vault/share token.
     * @return accretionEngine Clone address of the linked engine.
     */
    function createIndex(CreateIndexParams calldata p)
        external
        onlyLauncher
        returns (address index, address accretionEngine)
    {
        uint256 n = p.constituents.length;
        if (n < 2 || n > MAX_CONSTITUENTS) revert InvalidConstituentCount();
        if (p.initialWeightsBps.length != n) revert LengthMismatch();
        if (p.creator == address(0)) revert ZeroAddress();

        uint256 weightSum;
        for (uint256 i = 0; i < n; ++i) {
            address c = p.constituents[i];
            if (c == address(0)) revert ZeroAddress();
            AssetRecord memory rec = assetRecords[c];
            if (!rec.approved) revert AssetNotApproved(c);
            if (rec.priceFeed == address(0)) revert MissingPriceFeed(c);
            weightSum += p.initialWeightsBps[i];
            for (uint256 j = 0; j < i; ++j) {
                if (p.constituents[j] == c) revert DuplicateConstituent();
            }
        }
        if (weightSum != MAX_BPS) revert InvalidWeights();

        index = Clones.clone(indexImplementation);
        accretionEngine = Clones.clone(engineImplementation);

        // Wire index first (engine address known), then engine (reads constituents from index).
        address[] memory cons = p.constituents;
        AccretiveIndex(index)
            .initialize(
                p.name,
                p.symbol,
                cons,
                address(this),
                launcher,
                accretionEngine,
                protocolTreasury,
                MINT_FEE_BPS,
                REDEEM_FEE_BPS
            );

        uint16[] memory weights = p.initialWeightsBps;
        AccretionEngine(accretionEngine).initialize(index, address(this), usdc, swapAdapter, weights);

        isIndex[index] = true;
        isEngine[accretionEngine] = true;
        engineOf[index] = accretionEngine;
        _indexes.push(index);

        emit IndexCreated(index, accretionEngine, p.creator, p.name, p.symbol, cons, weights);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function indexCount() external view returns (uint256) {
        return _indexes.length;
    }

    function indexes() external view returns (address[] memory) {
        return _indexes;
    }

    function indexAt(uint256 i) external view returns (address) {
        return _indexes[i];
    }

    function isApprovedAsset(address asset) external view returns (bool) {
        return assetRecords[asset].approved;
    }

    function priceFeedOf(address asset) external view returns (address) {
        return assetRecords[asset].priceFeed;
    }
}
