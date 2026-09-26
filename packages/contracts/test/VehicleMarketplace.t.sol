// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {VehicleNFT} from "../src/VehicleNFT.sol";
import {VehicleMarketplace} from "../src/VehicleMarketplace.sol";

contract VehicleMarketplaceTest is Test {
    MockUSDC usdc;
    VehicleNFT nft;
    VehicleMarketplace market;
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address feeRecipient = makeAddr("feeRecipient");
    uint256 constant PRICE = 1_000 * 1e6;

    function setUp() public {
        usdc = new MockUSDC(address(this));
        nft = new VehicleNFT(address(this));
        market = new VehicleMarketplace(nft, usdc, feeRecipient, 250);
        nft.mint(seller);
        usdc.mint(buyer, PRICE);
    }

    function _approveAndList() private {
        vm.prank(seller);
        nft.approve(address(market), 1);
        vm.prank(seller);
        market.listVehicle(1, PRICE);
    }

    function testSellerCanListApprovedNft() public {
        _approveAndList();
        (address listedSeller, uint256 listedPrice, bool active) = market.listings(1);
        assertEq(listedSeller, seller);
        assertEq(listedPrice, PRICE);
        assertTrue(active);
    }

    function testNonOwnerCannotList() public {
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.NotTokenOwner.selector);
        market.listVehicle(1, PRICE);
    }

    function testListingRequiresNftApproval() public {
        vm.prank(seller);
        vm.expectRevert(VehicleMarketplace.NftNotApproved.selector);
        market.listVehicle(1, PRICE);
    }

    function testSellerCanCancel() public {
        _approveAndList();
        vm.prank(seller);
        market.cancelListing(1);
        (,, bool active) = market.listings(1);
        assertFalse(active);
    }

    function testInsufficientBalanceCannotBuy() public {
        _approveAndList();
        address poorBuyer = makeAddr("poorBuyer");
        vm.prank(poorBuyer);
        usdc.approve(address(market), PRICE);
        vm.prank(poorBuyer);
        vm.expectRevert();
        market.buyVehicle(1);
        (,, bool active) = market.listings(1);
        assertTrue(active);
    }

    function testInsufficientAllowanceCannotBuy() public {
        _approveAndList();
        vm.prank(buyer);
        vm.expectRevert();
        market.buyVehicle(1);
        assertEq(nft.ownerOf(1), seller);
    }

    function testPurchasePaysSellerAndFeeAndTransfersNft() public {
        _approveAndList();
        vm.prank(buyer);
        usdc.approve(address(market), PRICE);

        vm.expectEmit(true, true, true, true);
        emit VehicleMarketplace.VehiclePurchased(seller, buyer, 1, PRICE, 25 * 1e6);
        vm.prank(buyer);
        market.buyVehicle(1);

        assertEq(usdc.balanceOf(seller), 975 * 1e6);
        assertEq(usdc.balanceOf(feeRecipient), 25 * 1e6);
        assertEq(usdc.balanceOf(buyer), 0);
        assertEq(nft.ownerOf(1), buyer);
        (,, bool active) = market.listings(1);
        assertFalse(active);
    }

    function testCannotPurchaseTwice() public {
        _approveAndList();
        vm.prank(buyer);
        usdc.approve(address(market), PRICE);
        vm.prank(buyer);
        market.buyVehicle(1);
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.ListingNotActive.selector);
        market.buyVehicle(1);
    }

    function testRevokedApprovalMakesListingUnbuyable() public {
        _approveAndList();
        vm.prank(seller);
        nft.approve(address(0), 1);
        vm.prank(buyer);
        usdc.approve(address(market), PRICE);
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.NftNotApproved.selector);
        market.buyVehicle(1);
    }

    function testNewOwnerCanReplaceStaleListing() public {
        _approveAndList();
        vm.prank(seller);
        nft.transferFrom(seller, buyer, 1);
        vm.prank(buyer);
        nft.approve(address(market), 1);
        vm.prank(buyer);
        market.listVehicle(1, PRICE);
        (address listedSeller,, bool active) = market.listings(1);
        assertEq(listedSeller, buyer);
        assertTrue(active);
    }
}
