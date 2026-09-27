use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked},
};

declare_id!("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB");

const FEE_BPS: u64 = 250;
const BPS_DENOMINATOR: u64 = 10_000;
const FEE_RECIPIENT: Pubkey = Pubkey::new_from_array([
    253, 23, 36, 56, 90, 160, 199, 91, 100, 251, 120, 205, 96, 47, 161, 217,
    145, 253, 235, 247, 107, 19, 197, 142, 215, 2, 234, 200, 53, 233, 246, 24,
]);

#[program]
pub mod vehicle_marketplace {
    use super::*;

    pub fn initialize_market(ctx: Context<InitializeMarket>) -> Result<()> {
        ctx.accounts.market_config.payment_mint = ctx.accounts.payment_mint.key();
        Ok(())
    }

    pub fn list_vehicle(ctx: Context<ListVehicle>, price: u64) -> Result<()> {
        require!(price > 0, MarketplaceError::InvalidPrice);
        require!(ctx.accounts.vehicle_mint.decimals == 0 && ctx.accounts.vehicle_mint.supply == 1, MarketplaceError::InvalidVehicleMint);
        require!(ctx.accounts.payment_mint.decimals == 6, MarketplaceError::InvalidPaymentMint);
        require!(ctx.accounts.seller_vehicle.amount == 1, MarketplaceError::NotVehicleOwner);

        let listing = &mut ctx.accounts.listing;
        // This PDA is never closed: every successful listing gets a fresh generation.
        listing.version = listing.version.checked_add(1).ok_or(MarketplaceError::VersionExhausted)?;
        listing.active = true;
        listing.seller = ctx.accounts.seller.key();
        listing.vehicle_mint = ctx.accounts.vehicle_mint.key();
        listing.payment_mint = ctx.accounts.payment_mint.key();
        listing.price = price;
        listing.bump = ctx.bumps.listing;

        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked {
                from: ctx.accounts.seller_vehicle.to_account_info(),
                mint: ctx.accounts.vehicle_mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            }),
            1,
            0,
        )?;
        Ok(())
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let mint = ctx.accounts.vehicle_mint.key();
        let bump = [ctx.accounts.listing.bump];
        let seeds: &[&[u8]] = &[b"listing", mint.as_ref(), &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked {
                from: ctx.accounts.escrow.to_account_info(),
                mint: ctx.accounts.vehicle_mint.to_account_info(),
                to: ctx.accounts.seller_vehicle.to_account_info(),
                authority: ctx.accounts.listing.to_account_info(),
            }, &[seeds]),
            1,
            0,
        )?;
        token::close_account(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.listing.to_account_info(),
        }, &[seeds]))?;
        ctx.accounts.listing.active = false;
        Ok(())
    }

    pub fn buy_vehicle(ctx: Context<BuyVehicle>, expected_version: u64, max_price: u64) -> Result<()> {
        // Checked before any transfer; account constraints also reject stale intent.
        require!(ctx.accounts.listing.version == expected_version, MarketplaceError::ListingVersionMismatch);
        require!(ctx.accounts.listing.price <= max_price, MarketplaceError::PriceExceedsMaximum);
        let price = ctx.accounts.listing.price;
        require!(ctx.accounts.buyer_payment.amount >= price, MarketplaceError::InsufficientPayment);
        let fee = (u128::from(price) * u128::from(FEE_BPS) / u128::from(BPS_DENOMINATOR)) as u64;
        let seller_amount = price.checked_sub(fee).ok_or(MarketplaceError::InvalidPrice)?;

        token::transfer_checked(CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.buyer_payment.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.seller_payment.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        }), seller_amount, 6)?;
        token::transfer_checked(CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.buyer_payment.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.fee_payment.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        }), fee, 6)?;

        let mint = ctx.accounts.vehicle_mint.key();
        let bump = [ctx.accounts.listing.bump];
        let seeds: &[&[u8]] = &[b"listing", mint.as_ref(), &bump];
        token::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.escrow.to_account_info(),
            mint: ctx.accounts.vehicle_mint.to_account_info(),
            to: ctx.accounts.buyer_vehicle.to_account_info(),
            authority: ctx.accounts.listing.to_account_info(),
        }, &[seeds]), 1, 0)?;
        token::close_account(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.listing.to_account_info(),
        }, &[seeds]))?;

        ctx.accounts.listing.active = false;
        emit!(VehiclePurchased {
            vehicle_mint: mint,
            seller: ctx.accounts.seller.key(),
            buyer: ctx.accounts.buyer.key(),
            price,
            fee,
            version: ctx.accounts.listing.version,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeMarket<'info> {
    // The existing protocol authority chooses the one payment asset. No first-caller takeover.
    #[account(mut, address = FEE_RECIPIENT)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + MarketConfig::INIT_SPACE, seeds = [b"market"], bump)]
    pub market_config: Account<'info, MarketConfig>,
    #[account(constraint = payment_mint.decimals == 6 @ MarketplaceError::InvalidPaymentMint)]
    pub payment_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ListVehicle<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(seeds = [b"market"], bump)]
    pub market_config: Account<'info, MarketConfig>,
    #[account(constraint = vehicle_mint.decimals == 0 && vehicle_mint.supply == 1 @ MarketplaceError::InvalidVehicleMint)]
    pub vehicle_mint: Account<'info, Mint>,
    #[account(address = market_config.payment_mint @ MarketplaceError::InvalidPaymentMint,
      constraint = payment_mint.decimals == 6 @ MarketplaceError::InvalidPaymentMint)]
    pub payment_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = vehicle_mint, associated_token::authority = seller)]
    pub seller_vehicle: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = seller, space = 8 + Listing::INIT_SPACE, seeds = [b"listing", vehicle_mint.key().as_ref()], bump,
      constraint = !listing.active @ MarketplaceError::ListingAlreadyActive)]
    pub listing: Account<'info, Listing>,
    #[account(init, payer = seller, associated_token::mint = vehicle_mint, associated_token::authority = listing)]
    pub escrow: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    pub vehicle_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"listing", vehicle_mint.key().as_ref()], bump = listing.bump,
      has_one = seller, has_one = vehicle_mint,
      constraint = listing.active @ MarketplaceError::ListingNotActive)]
    pub listing: Account<'info, Listing>,
    #[account(mut, associated_token::mint = vehicle_mint, associated_token::authority = listing)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = seller, associated_token::mint = vehicle_mint, associated_token::authority = seller)]
    pub seller_vehicle: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(expected_version: u64, max_price: u64)]
pub struct BuyVehicle<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub vehicle_mint: Account<'info, Mint>,
    #[account(seeds = [b"market"], bump)]
    pub market_config: Account<'info, MarketConfig>,
    #[account(mut, seeds = [b"listing", vehicle_mint.key().as_ref()], bump = listing.bump,
      has_one = vehicle_mint,
      constraint = listing.active @ MarketplaceError::ListingNotActive,
      constraint = listing.version == expected_version @ MarketplaceError::ListingVersionMismatch,
      constraint = listing.price <= max_price @ MarketplaceError::PriceExceedsMaximum)]
    pub listing: Account<'info, Listing>,
    #[account(mut, address = listing.seller)]
    pub seller: SystemAccount<'info>,
    #[account(address = FEE_RECIPIENT)]
    pub fee_recipient: SystemAccount<'info>,
    #[account(address = market_config.payment_mint @ MarketplaceError::InvalidPaymentMint,
      constraint = payment_mint.key() == listing.payment_mint @ MarketplaceError::InvalidPaymentMint,
      constraint = payment_mint.decimals == 6 @ MarketplaceError::InvalidPaymentMint)]
    pub payment_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = vehicle_mint, associated_token::authority = listing)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = buyer, associated_token::mint = vehicle_mint, associated_token::authority = buyer)]
    pub buyer_vehicle: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = payment_mint, associated_token::authority = buyer)]
    pub buyer_payment: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = buyer, associated_token::mint = payment_mint, associated_token::authority = seller)]
    pub seller_payment: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = buyer, associated_token::mint = payment_mint, associated_token::authority = fee_recipient)]
    pub fee_payment: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct MarketConfig {
    pub payment_mint: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub vehicle_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub price: u64,
    pub bump: u8,
    pub active: bool,
    pub version: u64,
}

#[event]
pub struct VehiclePurchased {
    pub vehicle_mint: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub fee: u64,
    pub version: u64,
}

#[error_code]
pub enum MarketplaceError {
    #[msg("Listing price must be greater than zero")]
    InvalidPrice,
    #[msg("Vehicle mint must have zero decimals and supply one")]
    InvalidVehicleMint,
    #[msg("Payment mint must match the configured marketplace asset and have six decimals")]
    InvalidPaymentMint,
    #[msg("Seller must own the single vehicle token")]
    NotVehicleOwner,
    #[msg("Buyer payment token balance is below the listing price")]
    InsufficientPayment,
    #[msg("Listing is no longer active; refresh and review the new terms")]
    ListingNotActive,
    #[msg("Listing is already active")]
    ListingAlreadyActive,
    #[msg("Listing changed after review; refresh and confirm the new terms")]
    ListingVersionMismatch,
    #[msg("Listing price exceeds the buyer's authorized maximum")]
    PriceExceedsMaximum,
    #[msg("Listing version cannot increase further")]
    VersionExhausted,
}
