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
        (address listedSeller, uint256 listedPrice, bool active, uint256 version) = market.listings(1);
        assertEq(listedSeller, seller);
        assertEq(listedPrice, PRICE);
        assertTrue(active);
        assertEq(version, 1);
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
        (,, bool active, uint256 version) = market.listings(1);
        assertFalse(active);
        assertEq(version, 1);
    }

    function testInsufficientBalanceCannotBuy() public {
        _approveAndList();
        address poorBuyer = makeAddr("poorBuyer");
        vm.prank(poorBuyer);
        usdc.approve(address(market), PRICE);
        vm.prank(poorBuyer);
        vm.expectRevert();
        market.buyVehicle(1, 1, PRICE);
        (,, bool active,) = market.listings(1);
        assertTrue(active);
    }

    function testInsufficientAllowanceCannotBuy() public {
        _approveAndList();
        vm.prank(buyer);
        vm.expectRevert();
        market.buyVehicle(1, 1, PRICE);
        assertEq(nft.ownerOf(1), seller);
    }

    function testPurchasePaysSellerAndFeeAndTransfersNft() public {
        _approveAndList();
        vm.prank(buyer);
        usdc.approve(address(market), PRICE);

        vm.expectEmit(true, true, true, true);
        emit VehicleMarketplace.VehiclePurchased(seller, buyer, 1, PRICE, 25 * 1e6, 1);
        vm.prank(buyer);
        market.buyVehicle(1, 1, PRICE + 1);

        assertEq(usdc.balanceOf(seller), 975 * 1e6);
        assertEq(usdc.balanceOf(feeRecipient), 25 * 1e6);
        assertEq(usdc.balanceOf(buyer), 0);
        assertEq(nft.ownerOf(1), buyer);
        (,, bool active, uint256 version) = market.listings(1);
        assertFalse(active);
        assertEq(version, 1);
    }

    function testCannotPurchaseTwice() public {
        _approveAndList();
        vm.prank(buyer);
        usdc.approve(address(market), PRICE);
        vm.prank(buyer);
        market.buyVehicle(1, 1, PRICE);
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.ListingNotActive.selector);
        market.buyVehicle(1, 1, PRICE);
    }

    function testRevokedApprovalMakesListingUnbuyable() public {
        _approveAndList();
        vm.prank(seller);
        nft.approve(address(0), 1);
        vm.prank(buyer);
        usdc.approve(address(market), PRICE);
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.NftNotApproved.selector);
        market.buyVehicle(1, 1, PRICE);
    }

    function testNewOwnerCanReplaceStaleListing() public {
        _approveAndList();
        vm.prank(seller);
        nft.transferFrom(seller, buyer, 1);
        vm.prank(buyer);
        nft.approve(address(market), 1);
        vm.prank(buyer);
        market.listVehicle(1, PRICE);
        (address listedSeller,, bool active, uint256 version) = market.listings(1);
        assertEq(listedSeller, buyer);
        assertTrue(active);
        assertEq(version, 2);
    }

    function testSamePriceRelistingRejectsReviewedVersion() public {
        _approveAndList();
        (,,, uint256 reviewedVersion) = market.listings(1);
        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(seller);
        market.cancelListing(1);
        vm.prank(seller);
        market.listVehicle(1, PRICE);
        (,,, uint256 newVersion) = market.listings(1);
        assertEq(newVersion, reviewedVersion + 1);

        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.ListingVersionMismatch.selector);
        market.buyVehicle(1, reviewedVersion, PRICE);
        assertEq(nft.ownerOf(1), seller);
        assertEq(usdc.balanceOf(buyer), PRICE);
    }

    function testHigherPriceRelistingRejectsOldIntentEvenWithUnlimitedAllowance() public {
        _approveAndList();
        usdc.mint(buyer, PRICE);
        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(seller);
        market.cancelListing(1);
        vm.prank(seller);
        market.listVehicle(1, PRICE * 3 / 2);
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.ListingVersionMismatch.selector);
        market.buyVehicle(1, 1, PRICE);

        // The cap is independently enforced, even with the new version.
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.PriceExceedsMaximum.selector);
        market.buyVehicle(1, 2, PRICE);
        assertEq(usdc.balanceOf(buyer), PRICE * 2);
    }

    function testCurrentVersionRejectsMaximumBelowPrice() public {
        _approveAndList();
        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(buyer);
        vm.expectRevert(VehicleMarketplace.PriceExceedsMaximum.selector);
        market.buyVehicle(1, 1, PRICE - 1);
    }

    function testVersionSurvivesPurchaseAndNewOwnerRelisting() public {
        _approveAndList();
        vm.startPrank(buyer);
        usdc.approve(address(market), PRICE);
        market.buyVehicle(1, 1, PRICE);
        nft.approve(address(market), 1);
        market.listVehicle(1, PRICE);
        vm.stopPrank();
        (address newSeller,, bool active, uint256 version) = market.listings(1);
        assertEq(newSeller, buyer);
        assertTrue(active);
        assertEq(version, 2);
    }
}
