// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title AggregatorV3Interface
 * @notice Minimal Chainlink AggregatorV3 surface used by MockPriceFeed / NavLib consumers.
 */
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    function getRoundData(uint80 _roundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/**
 * @title MockPriceFeed
 * @notice Sepolia/unit-test AggregatorV3-compatible mock. decimals() = 8.
 * @dev NOT for mainnet. Guardian/tests set answers explicitly.
 */
contract MockPriceFeed is AggregatorV3Interface {
    uint8 public constant override decimals = 8;

    string private _description;
    uint256 public override version = 1;

    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId;

    error RoundNotComplete();

    constructor(string memory description_, int256 initialAnswer) {
        _description = description_;
        _setAnswer(initialAnswer);
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function getRoundData(uint80 _rid)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        if (_rid != _roundId) revert RoundNotComplete();
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    /// @notice Test/ops helper to push a new answer (8-dec).
    function setAnswer(int256 newAnswer) external {
        _setAnswer(newAnswer);
    }

    function _setAnswer(int256 newAnswer) private {
        unchecked {
            ++_roundId;
        }
        _answer = newAnswer;
        _updatedAt = block.timestamp;
    }
}
