// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { TreasuryVault } from "../src/TreasuryVault.sol";
import { SomtinelResponder } from "../src/SomtinelResponder.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        TreasuryVault vault = new TreasuryVault{ value: 0.05 ether }(deployer);
        
        SomtinelResponder responder = new SomtinelResponder(deployer, address(vault));

        vault.setResponder(address(responder));

        vm.stopBroadcast();

        require(address(vault).code.length > 0, "Vault deployment failed");
        require(address(responder).code.length > 0, "Responder deployment failed");
    }
}
