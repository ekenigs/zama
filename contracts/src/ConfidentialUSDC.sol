// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {
    ERC7984ERC20Wrapper,
    ERC7984
} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";

contract ConfidentialUSDC is ERC7984ERC20Wrapper, ZamaEthereumConfig {
    constructor(IERC20 underlying)
        ERC7984ERC20Wrapper(underlying)
        ERC7984("Confidential USDC", "cUSDC", "https://example.com/token")
    {}

    /// @dev Match underlying ERC-20 (18) so wrap rate is 1:1 — see euint64 max (~18.4 tokens at 18 decimals).
    function _maxDecimals() internal pure override returns (uint8) {
        return 18;
    }
}
