// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {VehicleNFT} from "../src/VehicleNFT.sol";
import {VehicleMarketplace} from "../src/VehicleMarketplace.sol";

contract DeployLocal is Script {
    // Anvil's standard mnemonic accounts. This script is exclusively for a fresh local chain.
    address constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant SELLER_TWO = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address constant BUYER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        require(block.chainid == 31337, "local Anvil only");
        vm.startBroadcast();
        MockUSDC usdc = new MockUSDC(DEPLOYER);
        VehicleNFT nft = new VehicleNFT(DEPLOYER);
        VehicleMarketplace market = new VehicleMarketplace(nft, usdc, DEPLOYER, 250);

        usdc.mint(BUYER, 100_000 * 1e6);
        usdc.mint(SELLER_TWO, 25_000 * 1e6);
        nft.mint(DEPLOYER);
        nft.mint(SELLER_TWO);
        nft.mint(DEPLOYER);
        vm.stopBroadcast();

        console2.log("MockUSDC", address(usdc));
        console2.log("VehicleNFT", address(nft));
        console2.log("VehicleMarketplace", address(market));
        console2.log("Seller 1 / fee recipient", DEPLOYER);
        console2.log("Seller 2", SELLER_TWO);
        console2.log("Buyer", BUYER);
    }
}
