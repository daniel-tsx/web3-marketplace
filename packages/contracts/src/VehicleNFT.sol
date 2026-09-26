// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @dev Fixed metadata is enough to make ownership and approval the interesting parts.
contract VehicleNFT is ERC721, Ownable {
    using Strings for uint256;

    uint256 public nextTokenId = 1;

    constructor(address initialOwner) ERC721("Study Vehicles", "VEHICLE") Ownable(initialOwner) {}

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId);
        bytes memory json =
            bytes(string.concat('{"name":"Vehicle ', tokenId.toString(), '","description":"Local EVM study vehicle"}'));
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }
}
