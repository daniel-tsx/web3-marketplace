module vehicle_marketplace::musdc;

use std::option;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

public struct MUSDC has drop {}

fun init(witness: MUSDC, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        witness, 6, b"mUSDC", b"Mock USDC", b"Development payment coin", option::none(), ctx
    );
    transfer::public_transfer(cap, ctx.sender());
    transfer::public_freeze_object(metadata);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(MUSDC {}, ctx); }

// Only the holder of TreasuryCap can seed development balances.
public fun mint_for_testing(cap: &mut TreasuryCap<MUSDC>, amount: u64, recipient: address, ctx: &mut TxContext) {
    let payment: Coin<MUSDC> = coin::mint(cap, amount, ctx);
    transfer::public_transfer(payment, recipient);
}
