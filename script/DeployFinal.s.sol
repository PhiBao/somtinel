// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { SomtinelResponder } from "../src/SomtinelResponder.sol";

contract DeployFinal is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address vaultAddr = vm.envAddress("SOMTINEL_VAULT_ADDRESS");

        vm.startBroadcast(deployerKey);

        SomtinelResponder r = new SomtinelResponder(deployer, vaultAddr);

        (bool ok,) = address(r).call{value: 33 ether}("");
        require(ok, "fund failed");

        (bool ok2,) = vaultAddr.call(abi.encodeWithSignature("setResponder(address)", address(r)));
        require(ok2, "setResponder failed");

        r.setTrustedDestination(deployer, true);

        vm.stopBroadcast();

        require(address(r).code.length > 0, "deploy failed");
    }
}
