// Minimal ABI from forge out
export const IndexZapRouterAbi = [
  {
    "type": "function",
    "name": "buyTargetBasket",
    "inputs": [
      {
        "name": "constituents",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "weightsBps",
        "type": "uint16[]",
        "internalType": "uint16[]"
      },
      {
        "name": "usdcIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minOut",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountsOut",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "factory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IndexFactory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mintExactSharesWithUSDC",
    "inputs": [
      {
        "name": "index",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "desiredGrossShares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxUSDC",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "userShares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "feeShares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "usdcSpent",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "redeemToUSDC",
    "inputs": [
      {
        "name": "index",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "sharesIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minUsdcOut",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "usdcOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "swapAdapter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IUniswapV4SwapAdapter"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "MintedWithUSDC",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "index",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "grossShares",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "usdcSpent",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "userShares",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
