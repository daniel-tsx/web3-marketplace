#[test_only]
module vehicle_marketplace::marketplace_tests;

use std::option;
use std::string;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::test_scenario::{Self, Scenario};
use vehicle_marketplace::marketplace::{Self, Listing, Market};
use vehicle_marketplace::musdc::{Self, MUSDC};
use vehicle_marketplace::vehicle::{Self, MintCap, Vehicle};

const SELLER: address = @0xA;
const BUYER: address = @0xB;
const FEE: address = @0xF;

fun setup(): Scenario {
    let mut scenario = test_scenario::begin(SELLER);
    marketplace::create_for_testing(FEE, scenario.ctx());
    vehicle::init_for_testing(scenario.ctx());
    musdc::init_for_testing(scenario.ctx());
    scenario.next_tx(SELLER);
    {
        let cap = scenario.take_from_sender<MintCap>();
        vehicle::mint_for_testing(&cap, string::utf8(b"Demo vehicle"), SELLER, scenario.ctx());
        test_scenario::return_to_sender(cap);
    };
    scenario.next_tx(SELLER);
    {
        let mut cap = scenario.take_from_sender<TreasuryCap<MUSDC>>();
        musdc::mint_for_testing(&mut cap, 1_000, BUYER, scenario.ctx());
        test_scenario::return_to_sender(cap);
    };
    scenario
}

fun list(scenario: &mut Scenario) {
    scenario.next_tx(SELLER);
    let mut market = scenario.take_shared<Market>();
    let vehicle = scenario.take_from_sender<Vehicle>();
    marketplace::list(&mut market, vehicle, 1_000, scenario.ctx());
    assert!(option::is_some(marketplace::current_listing(&market)), 0);
    test_scenario::return_shared(market);
}

#[test]
fun seller_lists_and_cancels_custodied_vehicle() {
    let mut scenario = setup();
    list(&mut scenario);
    scenario.next_tx(SELLER);
    {
        let mut market = scenario.take_shared<Market>();
        let mut listing = scenario.take_shared<Listing>();
        assert!(marketplace::listing_active(&listing), 1);
        marketplace::cancel(&mut market, &mut listing, scenario.ctx());
        assert!(!marketplace::listing_active(&listing), 2);
        assert!(option::is_none(marketplace::current_listing(&market)), 3);
        test_scenario::return_shared(market);
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(SELLER);
    let vehicle = scenario.take_from_sender<Vehicle>();
    test_scenario::return_to_sender(vehicle);
    scenario.end();
}

#[test]
fun purchase_transfers_vehicle_and_splits_fee() {
    let mut scenario = setup();
    list(&mut scenario);
    scenario.next_tx(BUYER);
    {
        let mut market = scenario.take_shared<Market>();
        let mut listing = scenario.take_shared<Listing>();
        let payment = scenario.take_from_sender<Coin<MUSDC>>();
        marketplace::buy(&mut market, &mut listing, payment, scenario.ctx());
        assert!(!marketplace::listing_active(&listing), 4);
        assert!(option::is_none(marketplace::current_listing(&market)), 5);
        test_scenario::return_shared(market);
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(BUYER);
    let vehicle = scenario.take_from_sender<Vehicle>();
    test_scenario::return_to_sender(vehicle);
    scenario.next_tx(SELLER);
    let seller_payment = scenario.take_from_sender<Coin<MUSDC>>();
    assert!(coin::value(&seller_payment) == 975, 6);
    test_scenario::return_to_sender(seller_payment);
    scenario.next_tx(FEE);
    let fee_payment = scenario.take_from_sender<Coin<MUSDC>>();
    assert!(coin::value(&fee_payment) == 25, 7);
    test_scenario::return_to_sender(fee_payment);
    scenario.end();
}

#[test, expected_failure(abort_code = 1, location = vehicle_marketplace::marketplace)]
fun buyer_cannot_cancel_sellers_listing() {
    let mut scenario = setup();
    list(&mut scenario);
    scenario.next_tx(BUYER);
    let mut market = scenario.take_shared<Market>();
    let mut listing = scenario.take_shared<Listing>();
    marketplace::cancel(&mut market, &mut listing, scenario.ctx());
    test_scenario::return_shared(market);
    test_scenario::return_shared(listing);
    scenario.end();
}

#[test, expected_failure]
fun non_owner_cannot_supply_sellers_vehicle() {
    let mut scenario = setup();
    scenario.next_tx(BUYER);
    // Sui rejects taking an address-owned Vehicle from a different sender.
    let vehicle = scenario.take_from_sender<Vehicle>();
    test_scenario::return_to_sender(vehicle);
    scenario.end();
}

#[test, expected_failure(abort_code = 2, location = vehicle_marketplace::marketplace)]
fun seller_cannot_buy_own_listing() {
    let mut scenario = setup();
    scenario.next_tx(SELLER);
    {
        let mut cap = scenario.take_from_sender<TreasuryCap<MUSDC>>();
        musdc::mint_for_testing(&mut cap, 1_000, SELLER, scenario.ctx());
        test_scenario::return_to_sender(cap);
    };
    list(&mut scenario);
    scenario.next_tx(SELLER);
    let mut market = scenario.take_shared<Market>();
    let mut listing = scenario.take_shared<Listing>();
    let payment = scenario.take_from_sender<Coin<MUSDC>>();
    marketplace::buy(&mut market, &mut listing, payment, scenario.ctx());
    test_scenario::return_shared(market);
    test_scenario::return_shared(listing);
    scenario.end();
}

#[test, expected_failure(abort_code = 3, location = vehicle_marketplace::marketplace)]
fun insufficient_payment_aborts() {
    let mut scenario = setup();
    list(&mut scenario);
    scenario.next_tx(BUYER);
    let mut market = scenario.take_shared<Market>();
    let mut listing = scenario.take_shared<Listing>();
    let mut payment = scenario.take_from_sender<Coin<MUSDC>>();
    let short = coin::split(&mut payment, 999, scenario.ctx());
    test_scenario::return_to_sender(payment);
    marketplace::buy(&mut market, &mut listing, short, scenario.ctx());
    test_scenario::return_shared(market);
    test_scenario::return_shared(listing);
    scenario.end();
}

#[test, expected_failure(abort_code = 0, location = vehicle_marketplace::marketplace)]
fun closed_listing_cannot_be_bought_twice() {
    let mut scenario = setup();
    list(&mut scenario);
    scenario.next_tx(BUYER);
    {
        let mut market = scenario.take_shared<Market>();
        let mut listing = scenario.take_shared<Listing>();
        let payment = scenario.take_from_sender<Coin<MUSDC>>();
        marketplace::buy(&mut market, &mut listing, payment, scenario.ctx());
        test_scenario::return_shared(market);
        test_scenario::return_shared(listing);
    };
    scenario.next_tx(SELLER);
    {
        let mut cap = scenario.take_from_sender<TreasuryCap<MUSDC>>();
        musdc::mint_for_testing(&mut cap, 1_000, BUYER, scenario.ctx());
        test_scenario::return_to_sender(cap);
    };
    scenario.next_tx(BUYER);
    let mut market = scenario.take_shared<Market>();
    let mut listing = scenario.take_shared<Listing>();
    let payment = scenario.take_from_sender<Coin<MUSDC>>();
    marketplace::buy(&mut market, &mut listing, payment, scenario.ctx());
    test_scenario::return_shared(market);
    test_scenario::return_shared(listing);
    scenario.end();
}
