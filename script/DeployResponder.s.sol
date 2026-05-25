// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { TreasuryVault } from "../src/TreasuryVault.sol";
import { Script } from "forge-std/Script.sol";
import { SomtinelResponder } from "../src/SomtinelResponder.sol";

contract DeployResponder is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address vaultAddr = vm.envAddress("SOMTINEL_VAULT_ADDRESS");

        vm.startBroadcast(deployerKey);

        SomtinelResponder responder = new SomtinelResponder(deployer, vaultAddr);

        (bool ok,) = vaultAddr.call(abi.encodeWithSignature("setResponder(address)", address(responder)));
        require(ok, "setResponder failed");

        vm.stopBroadcast();

        require(address(responder).code.length > 0, "Responder deployment failed");
    }
}
