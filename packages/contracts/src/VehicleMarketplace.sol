// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Noncustodial, on-chain listings for one NFT collection and one ERC-20 currency.
contract VehicleMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    IERC721 public immutable vehicleNFT;
    IERC20 public immutable paymentToken;
    address public immutable feeRecipient;
    uint16 public immutable feeBps;
    mapping(uint256 tokenId => Listing) public listings;

    event VehicleListed(address indexed seller, uint256 indexed tokenId, uint256 price);
    event VehicleListingCancelled(address indexed seller, uint256 indexed tokenId);
    event VehiclePurchased(
        address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 price, uint256 fee
    );

    error InvalidConfiguration();
    error InvalidPrice();
    error NotTokenOwner();
    error NftNotApproved();
    error ListingAlreadyActive();
    error ListingNotActive();
    error NotListingSeller();
    error SelfPurchase();

    constructor(IERC721 nft, IERC20 token, address recipient, uint16 basisPoints) {
        if (
            address(nft) == address(0) || address(token) == address(0) || recipient == address(0)
                || basisPoints > 10_000
        ) revert InvalidConfiguration();
        vehicleNFT = nft;
        paymentToken = token;
        feeRecipient = recipient;
        feeBps = basisPoints;
    }

    function listVehicle(uint256 tokenId, uint256 price) external {
        if (price == 0) revert InvalidPrice();
        if (vehicleNFT.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (!_isApproved(tokenId, msg.sender)) revert NftNotApproved();
        // A new owner can replace a stale noncustodial listing left by a prior owner.
        if (listings[tokenId].active && listings[tokenId].seller == msg.sender) revert ListingAlreadyActive();

        listings[tokenId] = Listing({seller: msg.sender, price: price, active: true});
        emit VehicleListed(msg.sender, tokenId, price);
    }

    function cancelListing(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller != msg.sender) revert NotListingSeller();
        listing.active = false;
        emit VehicleListingCancelled(msg.sender, tokenId);
    }

    function buyVehicle(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        if (!listing.active) revert ListingNotActive();
        address seller = listing.seller;
        if (msg.sender == seller) revert SelfPurchase();
        // A noncustodial listing can go stale after an independent NFT transfer or approval revocation.
        if (vehicleNFT.ownerOf(tokenId) != seller) revert NotTokenOwner();
        if (!_isApproved(tokenId, seller)) revert NftNotApproved();

        uint256 price = listing.price;
        uint256 fee = price * feeBps / 10_000;
        listing.active = false;
        // Emit before external calls so a receiver callback cannot reorder this marketplace log.
        // Any later revert rolls the event back with the whole transaction.
        emit VehiclePurchased(seller, msg.sender, tokenId, price, fee);

        paymentToken.safeTransferFrom(msg.sender, seller, price - fee);
        if (fee != 0) paymentToken.safeTransferFrom(msg.sender, feeRecipient, fee);
        vehicleNFT.safeTransferFrom(seller, msg.sender, tokenId);
    }

    function _isApproved(uint256 tokenId, address owner) private view returns (bool) {
        return vehicleNFT.getApproved(tokenId) == address(this) || vehicleNFT.isApprovedForAll(owner, address(this));
    }
}
