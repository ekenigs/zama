// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {ConfidentialUSDC} from "../src/ConfidentialUSDC.sol";

contract DeployConfidentialToken is Script {
    function run() external {
        vm.startBroadcast();

        ERC20Mock underlying = new ERC20Mock();
        ConfidentialUSDC wrapper = new ConfidentialUSDC(IERC20(address(underlying)));

        console2.log("UNDERLYING_ADDRESS=", address(underlying));
        console2.log("CONTRACT_ADDRESS=", address(wrapper));

        vm.stopBroadcast();
    }
}
