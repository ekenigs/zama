// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {ConfidentialUSDC} from "../src/ConfidentialUSDC.sol";

/// @dev Deploy with Anvil account #8 (`TOKEN_DEPLOYER_PRIVATE_KEY`) on a fresh chain so
///      CREATE nonces 0/1 match `UNDERLYING_ADDRESS` / `CONTRACT_ADDRESS` in `.env`.
contract DeployConfidentialToken is Script {
    function run() external {
        address expectedUnderlying = vm.envAddress("UNDERLYING_ADDRESS");
        address expectedWrapper = vm.envAddress("CONTRACT_ADDRESS");

        vm.startBroadcast();

        ERC20Mock underlying = new ERC20Mock();
        ConfidentialUSDC wrapper = new ConfidentialUSDC(IERC20(address(underlying)));

        vm.stopBroadcast();

        require(
            address(underlying) == expectedUnderlying,
            "UNDERLYING_ADDRESS mismatch - restart Anvil or run README clean slate"
        );
        require(
            address(wrapper) == expectedWrapper,
            "CONTRACT_ADDRESS mismatch - restart Anvil or run README clean slate"
        );
    }
}
