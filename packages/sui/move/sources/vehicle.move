module vehicle_marketplace::vehicle;

use std::string::String;
use sui::object::{Self, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

public struct MintCap has key { id: UID }

public struct Vehicle has key, store {
    id: UID,
    name: String,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(MintCap { id: object::new(ctx) }, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }

// The publisher holds MintCap for testnet seeding. Buyers cannot mint a vehicle.
public fun mint_for_testing(_: &MintCap, name: String, recipient: address, ctx: &mut TxContext) {
    transfer::public_transfer(Vehicle { id: object::new(ctx), name }, recipient);
}

public fun name(vehicle: &Vehicle): &String { &vehicle.name }
