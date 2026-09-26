module vehicle_marketplace::marketplace;

use std::option::{Self, Option};
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};
use vehicle_marketplace::musdc::MUSDC;
use vehicle_marketplace::vehicle::Vehicle;

const EListingActive: u64 = 0;
const ENotSeller: u64 = 1;
const ESelfPurchase: u64 = 2;
const EInsufficientPayment: u64 = 3;
const EWrongMarket: u64 = 4;
const EInvalidPrice: u64 = 5;

public struct Market has key {
    id: UID,
    fee_recipient: address,
    current_listing: Option<ID>,
}

// A shared listing wraps the Vehicle. It cannot be used as a seller-owned input
// while listed. Closed listings remain shared but hold no Vehicle.
public struct Listing has key {
    id: UID,
    market: ID,
    seller: address,
    price: u64,
    vehicle: Option<Vehicle>,
}

public struct Listed has copy, drop {
    listing: ID,
    vehicle: ID,
    seller: address,
    price: u64,
}

public struct Closed has copy, drop { listing: ID, vehicle: ID, buyer: address }

fun init(ctx: &mut TxContext) {
    transfer::share_object(Market {
        id: object::new(ctx),
        fee_recipient: ctx.sender(),
        current_listing: option::none(),
    });
}

#[test_only]
public fun create_for_testing(fee_recipient: address, ctx: &mut TxContext) {
    transfer::share_object(Market {
        id: object::new(ctx),
        fee_recipient,
        current_listing: option::none(),
    });
}

public fun current_listing(market: &Market): &Option<ID> { &market.current_listing }
public fun listing_active(listing: &Listing): bool { option::is_some(&listing.vehicle) }

public fun list(market: &mut Market, vehicle: Vehicle, price: u64, ctx: &mut TxContext) {
    assert!(option::is_none(&market.current_listing), EListingActive);
    assert!(price > 0, EInvalidPrice);
    let vehicle_id = object::id(&vehicle);
    let listing = Listing {
        id: object::new(ctx),
        market: object::id(market),
        seller: ctx.sender(),
        price,
        vehicle: option::some(vehicle),
    };
    let listing_id = object::id(&listing);
    market.current_listing = option::some(listing_id);
    event::emit(Listed { listing: listing_id, vehicle: vehicle_id, seller: ctx.sender(), price });
    transfer::share_object(listing);
}

public fun cancel(market: &mut Market, listing: &mut Listing, ctx: &mut TxContext) {
    assert!(listing.market == object::id(market), EWrongMarket);
    assert!(option::is_some(&listing.vehicle), EListingActive);
    assert!(listing.seller == ctx.sender(), ENotSeller);
    let vehicle = option::extract(&mut listing.vehicle);
    let vehicle_id = object::id(&vehicle);
    market.current_listing = option::none();
    transfer::public_transfer(vehicle, listing.seller);
    event::emit(Closed { listing: object::id(listing), vehicle: vehicle_id, buyer: listing.seller });
}

public fun buy(market: &mut Market, listing: &mut Listing, payment: Coin<MUSDC>, ctx: &mut TxContext) {
    assert!(listing.market == object::id(market), EWrongMarket);
    assert!(option::is_some(&listing.vehicle), EListingActive);
    assert!(listing.seller != ctx.sender(), ESelfPurchase);
    assert!(coin::value(&payment) >= listing.price, EInsufficientPayment);
    let mut payment = payment;
    let fee = ((listing.price as u128) * 250 / 10000) as u64;
    let seller_coin = coin::split(&mut payment, listing.price - fee, ctx);
    let fee_coin = coin::split(&mut payment, fee, ctx);
    transfer::public_transfer(seller_coin, listing.seller);
    transfer::public_transfer(fee_coin, market.fee_recipient);
    if (coin::value(&payment) == 0) {
        coin::destroy_zero(payment);
    } else {
        transfer::public_transfer(payment, ctx.sender());
    };
    let vehicle = option::extract(&mut listing.vehicle);
    let vehicle_id = object::id(&vehicle);
    market.current_listing = option::none();
    transfer::public_transfer(vehicle, ctx.sender());
    event::emit(Closed { listing: object::id(listing), vehicle: vehicle_id, buyer: ctx.sender() });
}
