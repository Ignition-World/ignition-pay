#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Map, Symbol, Vec};
use crate::MultiOracleContractClient;

const MAX_CALLS_PER_LEDGER: u32 = 5;
const CONTRACT_VERSION: &str = "0.1.0";
const VERSION_KEY: &str = "contract_version";
const ADMIN_KEY: &str = "admin";
const AUTHORIZATIONS_KEY: &str = "authorizations";
const RATE_LIMIT_KEY: &str = "rate_limit";
const KYC_STATUS_KEY: &str = "kyc_status";
const PENDING_UPGRADE_KEY: &str = "pending_upgrade";
const DEFAULT_MAX_STALENESS_SECONDS: u64 = 300;

#[contracttype]
#[derive(Clone)]
pub struct PriceObservation {
    pub price: u64,
    pub timestamp: u64,
}

#[contract]
pub struct IgnitionPayContract;

#[contractimpl]
impl IgnitionPayContract {
    /// Initialize the contract with an admin address.
    /// This should be called exactly once after deployment.
    pub fn initialize(env: Env, admin: Address) {
        // Guard against re-initialization
        if env.storage().instance().has(&Symbol::new(&env, VERSION_KEY)) {
            panic!("Contract already initialized");
        }

        env.storage().instance().set(&Symbol::new(&env, ADMIN_KEY), &admin);
        env.storage().instance().set(&Symbol::new(&env, AUTHORIZATIONS_KEY), &Vec::<Address>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, RATE_LIMIT_KEY), &Map::<Address, (u32, u32)>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, KYC_STATUS_KEY), &Map::<Address, bool>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, VERSION_KEY), &Symbol::new(&env, CONTRACT_VERSION));
    }

    fn check_rate_limit(&self, env: &Env, user: &Address) {
        let mut rate_limit: Map<Address, (u32, u32)> = env.storage().instance().get(&Symbol::new(&env, RATE_LIMIT_KEY)).unwrap_or_else(|| Map::new(env));
        let current_ledger = env.ledger().sequence();

        let (last_ledger, call_count) = rate_limit.get(user.clone()).unwrap_or((0, 0));

        if last_ledger == current_ledger {
            if call_count >= MAX_CALLS_PER_LEDGER {
                panic!("Rate limit exceeded");
            }
            rate_limit.set(user.clone(), (current_ledger, call_count + 1));
        } else {
            rate_limit.set(user.clone(), (current_ledger, 1));
        }

        env.storage().instance().set(&Symbol::new(&env, RATE_LIMIT_KEY), &rate_limit);
    }

    /// Set KYC status for a user. Only callable by admin.
    pub fn set_kyc_status(&self, env: &Env, user: &Address, kyc_completed: bool) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY)).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        self.check_rate_limit(&env, &admin);

        let mut kyc_status: Map<Address, bool> = env.storage().instance().get(&Symbol::new(&env, KYC_STATUS_KEY)).unwrap_or_else(|| Map::new(env));
        kyc_status.set(user.clone(), kyc_completed);
        env.storage().instance().set(&Symbol::new(&env, KYC_STATUS_KEY), &kyc_status);
    }

    /// Authorize a user. Requires admin auth and KYC completion.
    pub fn authorize(&self, env: Env, user: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY)).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        self.check_rate_limit(&env, &admin);

        let kyc_status: Map<Address, bool> = env.storage().instance().get(&Symbol::new(&env, KYC_STATUS_KEY)).unwrap_or_else(|| Map::new(&env));
        if !kyc_status.get(user.clone()).unwrap_or(false) {
            panic!("KYC not completed");
        }

        let mut authorizations: Vec<Address> = env.storage().instance().get(&Symbol::new(&env, AUTHORIZATIONS_KEY)).unwrap_or_else(|| Vec::new(&env));
        authorizations.push_back(user);
        env.storage().instance().set(&Symbol::new(&env, AUTHORIZATIONS_KEY), &authorizations);
    }

    /// Revoke authorization for a user. Only callable by admin.
    pub fn revoke(&self, env: Env, user: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY)).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        self.check_rate_limit(&env, &admin);

        let mut authorizations: Vec<Address> = env.storage().instance().get(&Symbol::new(&env, AUTHORIZATIONS_KEY)).unwrap_or_else(|| Vec::new(&env));
        if let Some(index) = authorizations.iter().position(|a| a == user) {
            authorizations.remove(index as u32);
        }
        env.storage().instance().set(&Symbol::new(&env, AUTHORIZATIONS_KEY), &authorizations);
    }

    /// Check if a user is authorized.
    pub fn is_authorized(env: Env, user: Address) -> bool {
        let authorizations: Vec<Address> = env.storage().instance().get(&Symbol::new(&env, AUTHORIZATIONS_KEY)).unwrap_or_else(|| Vec::new(&env));
        authorizations.contains(&user)
    }

    pub fn version(env: Env) -> Symbol {
        env.storage().instance().get(&Symbol::new(&env, VERSION_KEY)).unwrap_or_else(|| panic!("Version not set"))
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY)).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        env.storage().instance().set(&Symbol::new(&env, PENDING_UPGRADE_KEY), &new_wasm_hash);
        env.events().publish((Symbol::new(&env, "upgrade_initiated"), &admin), &new_wasm_hash);
    }

    pub fn apply_upgrade(env: Env) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY)).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let new_wasm_hash: BytesN<32> = env.storage().instance().get(&Symbol::new(&env, PENDING_UPGRADE_KEY)).unwrap_or_else(|| panic!("No pending upgrade"));
        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
        env.storage().instance().set(&Symbol::new(&env, VERSION_KEY), &Symbol::new(&env, "0.2.0"));
        env.storage().instance().remove(&Symbol::new(&env, PENDING_UPGRADE_KEY));
        env.events().publish((Symbol::new(&env, "upgrade_applied"), &admin), &new_wasm_hash);
    }

    pub fn has_pending_upgrade(env: Env) -> bool {
        env.storage().instance().has(&Symbol::new(&env, PENDING_UPGRADE_KEY))
    }

    pub fn transfer_admin(env: Env, new_admin: Address) {
        let current_admin: Address = env.storage().instance().get(&Symbol::new(&env, ADMIN_KEY)).unwrap_or_else(|| panic!("Admin not set"));
        current_admin.require_auth();
        if current_admin == new_admin {
            panic!("New admin must be different from current admin");
        }
        env.storage().instance().set(&Symbol::new(&env, ADMIN_KEY), &new_admin);
        env.events().publish((Symbol::new(&env, "admin_transferred"), &current_admin), &new_admin);
    }
}
#[contract]
pub struct AssetAllowlistContract;

#[contractimpl]
impl AssetAllowlistContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "assets"), &Map::<Address, bool>::new(&env));
    }

    pub fn add_asset(&self, env: &Env, asset: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut assets: Map<Address, bool> = env.storage().instance().get(&Symbol::new(env, "assets")).unwrap_or_else(|| Map::new(env));
        assets.set(asset, true);
        env.storage().instance().set(&Symbol::new(env, "assets"), &assets);
    }

    pub fn remove_asset(&self, env: &Env, asset: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut assets: Map<Address, bool> = env.storage().instance().get(&Symbol::new(env, "assets")).unwrap_or_else(|| Map::new(env));
        assets.set(asset, false);
        env.storage().instance().set(&Symbol::new(env, "assets"), &assets);
    }

    pub fn is_asset_allowed(env: Env, asset: Address) -> bool {
        let assets: Map<Address, bool> = env.storage().instance().get(&Symbol::new(&env, "assets")).unwrap_or_else(|| Map::new(&env));
        assets.get(asset).unwrap_or(false)
    }
}

#[contract]
pub struct TrustlineManagerContract;

#[contractimpl]
impl TrustlineManagerContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "trustlines"), &Map::<(Address, Address), bool>::new(&env));
    }

    pub fn add_trustline(&self, env: &Env, asset: Address, account: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut trustlines: Map<(Address, Address), bool> = env.storage().instance().get(&Symbol::new(env, "trustlines")).unwrap_or_else(|| Map::new(env));
        trustlines.set((asset, account), true);
        env.storage().instance().set(&Symbol::new(env, "trustlines"), &trustlines);
    }

    pub fn remove_trustline(&self, env: &Env, asset: Address, account: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut trustlines: Map<(Address, Address), bool> = env.storage().instance().get(&Symbol::new(env, "trustlines")).unwrap_or_else(|| Map::new(env));
        trustlines.set((asset, account), false);
        env.storage().instance().set(&Symbol::new(env, "trustlines"), &trustlines);
    }

    pub fn has_trustline(env: Env, asset: Address, account: Address) -> bool {
        let trustlines: Map<(Address, Address), bool> = env.storage().instance().get(&Symbol::new(&env, "trustlines")).unwrap_or_else(|| Map::new(&env));
        trustlines.get((asset, account)).unwrap_or(false)
    }
}

#[contract]
pub struct Sep41TokenRouterContract;

#[contractimpl]
impl Sep41TokenRouterContract {
    pub fn transfer(env: Env, token: Address, from: Address, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        from.require_auth();
        env.invoke_contract::<()>(&token, &Symbol::new(&env, "transfer"), (from, to, amount));
    }
}

#[contracttype]
#[derive(Clone)]
pub struct Milestone {
    pub recipient: Address,
    pub amount: i128,
    pub released_bps: u32,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(&Symbol::new(&env, "milestones"), &Map::<u32, Milestone>::new(&env));
    }

    pub fn create_milestone(&self, env: &Env, id: u32, recipient: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        let mut milestones: Map<u32, Milestone> = env.storage().instance().get(&Symbol::new(env, "milestones")).unwrap_or_else(|| Map::new(env));
        if milestones.contains_key(id) {
            panic!("Milestone already exists");
        }
        milestones.set(id, Milestone { recipient, amount, released_bps: 0 });
        env.storage().instance().set(&Symbol::new(env, "milestones"), &milestones);
    }

    pub fn fund_milestone(&self, env: &Env, id: u32, funder: Address) {
        funder.require_auth();
        let milestones: Map<u32, Milestone> = env.storage().instance().get(&Symbol::new(env, "milestones")).unwrap_or_else(|| Map::new(env));
        if !milestones.contains_key(id) {
            panic!("Milestone not found");
        }
        let milestone = milestones.get(id).unwrap();
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (funder, escrow, milestone.amount));
    }

    pub fn release_milestone(&self, env: &Env, id: u32, percentage_bps: u32) {
        if percentage_bps == 0 || percentage_bps > 10_000 {
            panic!("Percentage must be between 1 and 10000 basis points");
        }
        let mut milestones: Map<u32, Milestone> = env.storage().instance().get(&Symbol::new(env, "milestones")).unwrap_or_else(|| Map::new(env));
        let mut milestone = milestones.get(id).unwrap_or_else(|| panic!("Milestone not found"));
        if percentage_bps <= milestone.released_bps {
            panic!("Release percentage must increase");
        }
        let release_amount = milestone.amount * (percentage_bps - milestone.released_bps) as i128 / 10_000;
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (escrow, milestone.recipient.clone(), release_amount));
        milestone.released_bps = percentage_bps;
        milestones.set(id, milestone);
        env.storage().instance().set(&Symbol::new(env, "milestones"), &milestones);
    }

    pub fn get_milestone(env: Env, id: u32) -> Milestone {
        let milestones: Map<u32, Milestone> = env.storage().instance().get(&Symbol::new(&env, "milestones")).unwrap_or_else(|| Map::new(&env));
        milestones.get(id).unwrap_or_else(|| panic!("Milestone not found"))
    }
}

#[contract]
pub struct MultiOracleContract;

#[contractimpl]
impl MultiOracleContract {
    pub fn initialize(env: Env, admin: Address, oracles: Vec<Address>) {
        let admin_key = "admin";
        let oracles_key = "oracles";

        if env.storage().instance().has(&admin_key) {
            panic!("Contract already initialized");
        }

        env.storage().instance().set(&admin_key, &admin);
        env.storage().instance().set(&oracles_key, &oracles);
        env.storage().instance().set(&"prices", &Map::<Symbol, Vec<PriceObservation>>::new(&env));
        env.storage().instance().set(&"max_staleness", &DEFAULT_MAX_STALENESS_SECONDS);
    }

    pub fn add_oracle(&self, env: &Env, new_oracle: Address) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut oracles: Vec<Address> = env.storage().instance().get(&"oracles").unwrap_or_else(|| Vec::new(env));
        oracles.push_back(new_oracle);
        env.storage().instance().set(&"oracles", &oracles);
    }

    pub fn remove_oracle(&self, env: &Env, oracle_to_remove: Address) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut oracles: Vec<Address> = env.storage().instance().get(&"oracles").unwrap_or_else(|| Vec::new(env));
        if let Some(index) = oracles.iter().position(|o| o == oracle_to_remove) {
            oracles.remove(index as u32);
        }
        env.storage().instance().set(&"oracles", &oracles);
    }

    pub fn push_price(&self, env: &Env, asset: Symbol, price: u64) {
        let caller = env.invoker();
        let oracles: Vec<Address> = env.storage().instance().get(&"oracles").unwrap_or_else(|| Vec::new(env));

        if !oracles.contains(&caller) {
            panic!("Caller is not a registered oracle");
        }

        let mut prices: Map<Symbol, Vec<PriceObservation>> = env.storage().instance().get(&"prices").unwrap_or_else(|| Map::new(env));
        let mut asset_prices = prices.get(asset.clone()).unwrap_or_else(|| Vec::new(env));
        
        asset_prices.push_back(PriceObservation { price, timestamp: env.ledger().timestamp() });
        prices.set(asset.clone(), asset_prices);
        env.storage().instance().set(&"prices", &prices);
    }

    pub fn set_max_staleness(&self, env: &Env, max_staleness_seconds: u64) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        env.storage().instance().set(&"max_staleness", &max_staleness_seconds);
    }

    pub fn max_staleness(&self, env: Env) -> u64 {
        env.storage().instance().get(&"max_staleness").unwrap_or(DEFAULT_MAX_STALENESS_SECONDS)
    }

    pub fn get_median_price(&self, env: &Env, asset: Symbol) -> u64 {
        let prices: Map<Symbol, Vec<PriceObservation>> = env.storage().instance().get(&"prices").unwrap_or_else(|| Map::new(&env));
        let observations = prices.get(asset.clone()).unwrap_or_else(|| panic!("No prices for asset"));

        if observations.is_empty() {
            panic!("No prices available for this asset");
        }

        let now = env.ledger().timestamp();
        let max_staleness = self.max_staleness(env.clone());
        let mut asset_prices: Vec<u64> = Vec::new(&env);
        for observation in observations.iter() {
            if observation.timestamp > now || now - observation.timestamp > max_staleness {
                continue;
            }
            asset_prices.push_back(observation.price);
        }
        if asset_prices.is_empty() {
            panic!("All prices are stale");
        }
        asset_prices.sort();
        let mid = asset_prices.len() / 2;
        asset_prices.get(mid).unwrap_or(0)
    }
}

#[contract]
pub struct PriceFeedContract;

#[contractimpl]
impl PriceFeedContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&"admin") {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&"admin", &admin);
        env.storage().instance().set(&"providers", &Vec::<Address>::new(&env));
    }

    pub fn register_provider(&self, env: &Env, provider: Address) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut providers: Vec<Address> = env.storage().instance().get(&"providers").unwrap_or_else(|| Vec::new(env));
        if providers.contains(&provider) {
            panic!("Provider already registered");
        }
        providers.push_back(provider);
        env.storage().instance().set(&"providers", &providers);
    }

    pub fn unregister_provider(&self, env: &Env, provider: Address) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut providers: Vec<Address> = env.storage().instance().get(&"providers").unwrap_or_else(|| Vec::new(env));
        if let Some(index) = providers.iter().position(|p| p == provider) {
            providers.remove(index as u32);
        }
        env.storage().instance().set(&"providers", &providers);
    }

    pub fn update_price(&self, env: &Env, multi_oracle_contract: Address, asset: Symbol, price: u64) {
        let caller = env.invoker();
        let providers: Vec<Address> = env.storage().instance().get(&"providers").unwrap_or_else(|| Vec::new(env));

        if !providers.contains(&caller) {
            panic!("Caller is not a registered provider");
        }

        let oracle_client = MultiOracleContractClient::new(env, &multi_oracle_contract);
        oracle_client.push_price(&asset, &price);
    }
}

#[contract]
pub struct AccessControlContract;

#[contractimpl]
impl AccessControlContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&"admin") {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&"admin", &admin);
        env.storage().instance().set(&"operators", &Vec::<Address>::new(&env));
    }

    pub fn has_admin_role(&self, env: &Env, user: &Address) -> bool {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        &admin == user
    }

    pub fn has_operator_role(&self, env: &Env, user: &Address) -> bool {
        let operators: Vec<Address> = env.storage().instance().get(&"operators").unwrap_or_else(|| Vec::new(env));
        operators.contains(user)
    }

    pub fn add_operator(&self, env: &Env, operator: Address) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut operators: Vec<Address> = env.storage().instance().get(&"operators").unwrap_or_else(|| Vec::new(env));
        if operators.contains(&operator) {
            panic!("Operator already exists");
        }
        operators.push_back(operator);
        env.storage().instance().set(&"operators", &operators);
    }

    pub fn remove_operator(&self, env: &Env, operator: Address) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut operators: Vec<Address> = env.storage().instance().get(&"operators").unwrap_or_else(|| Vec::new(env));
        if let Some(index) = operators.iter().position(|o| o == operator) {
            operators.remove(index as u32);
        }
        env.storage().instance().set(&"operators", &operators);
    }
}


#[contract]
pub struct PausableContract;

#[contractimpl]
impl PausableContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&"admin") {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&"admin", &admin);
        env.storage().instance().set(&"paused", &false);
    }

    pub fn is_paused(&self, env: &Env) -> bool {
        env.storage().instance().get(&"paused").unwrap_or(false)
    }

    pub fn pause(&self, env: &Env) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        env.storage().instance().set(&"paused", &true);
    }

    pub fn unpause(&self, env: &Env) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        env.storage().instance().set(&"paused", &false);
    }
}

#[contract]
pub struct WrappedAssetBridgeContract;

#[contractimpl]
impl WrappedAssetBridgeContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "native_token"), &Address::random(&env));
        env.storage().instance().set(&Symbol::new(&env, "wrapped_balances"), &Map::<Address, Map<Address, i128>>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "wrapped_tokens"), &Map::<Address, Address>::new(&env));
    }

    pub fn wrap(&self, env: &Env, caller: Address, native_asset: Address, amount: i128) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        caller.require_auth();

        let mut wrapped_balances: Map<Address, Map<Address, i128>> =
            env.storage().instance().get(&Symbol::new(&env, "wrapped_balances")).unwrap_or_else(|| Map::new(env));
        let mut user_balances = wrapped_balances.get(caller.clone()).unwrap_or_else(|| Map::new(env));

        let current = user_balances.get(native_asset.clone()).unwrap_or(0);
        user_balances.set(native_asset.clone(), current + amount);
        wrapped_balances.set(caller.clone(), user_balances);
        env.storage().instance().set(&Symbol::new(&env, "wrapped_balances"), &wrapped_balances);

        env.events().publish(
            (Symbol::new(&env, "asset_wrapped"), &caller),
            (native_asset, amount),
        );
    }

    pub fn unwrap(&self, env: &Env, caller: Address, native_asset: Address, amount: i128) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        caller.require_auth();

        let mut wrapped_balances: Map<Address, Map<Address, i128>> =
            env.storage().instance().get(&Symbol::new(&env, "wrapped_balances")).unwrap_or_else(|| Map::new(env));
        let mut user_balances = wrapped_balances.get(caller.clone()).unwrap_or_else(|| Map::new(env));

        let current = user_balances.get(native_asset.clone()).unwrap_or(0);
        if current < amount {
            panic!("Insufficient wrapped balance");
        }
        user_balances.set(native_asset.clone(), current - amount);
        wrapped_balances.set(caller.clone(), user_balances);
        env.storage().instance().set(&Symbol::new(&env, "wrapped_balances"), &wrapped_balances);

        env.events().publish(
            (Symbol::new(&env, "asset_unwrapped"), &caller),
            (native_asset, amount),
        );
    }

    pub fn get_wrapped_balance(env: Env, holder: Address, native_asset: Address) -> i128 {
        let wrapped_balances: Map<Address, Map<Address, i128>> =
            env.storage().instance().get(&Symbol::new(&env, "wrapped_balances")).unwrap_or_else(|| Map::new(&env));
        let user_balances = wrapped_balances.get(holder).unwrap_or_else(|| Map::new(&env));
        user_balances.get(native_asset).unwrap_or(0)
    }

    pub fn register_wrapped_token(&self, env: &Env, native_asset: Address, wrapped_token: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut wrapped_tokens: Map<Address, Address> =
            env.storage().instance().get(&Symbol::new(&env, "wrapped_tokens")).unwrap_or_else(|| Map::new(env));
        wrapped_tokens.set(native_asset, wrapped_token);
        env.storage().instance().set(&Symbol::new(&env, "wrapped_tokens"), &wrapped_tokens);
    }

    pub fn get_wrapped_token(env: Env, native_asset: Address) -> Option<Address> {
        let wrapped_tokens: Map<Address, Address> =
            env.storage().instance().get(&Symbol::new(&env, "wrapped_tokens")).unwrap_or_else(|| Map::new(&env));
        wrapped_tokens.get(native_asset)
    }
}

#[contract]
pub struct TokenMetadataContract;

#[contractimpl]
impl TokenMetadataContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "metadata"), &Map::<Address, Symbol>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "icons"), &Map::<Address, Symbol>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "descriptions"), &Map::<Address, Symbol>::new(&env));
    }

    pub fn set_metadata(&self, env: &Env, asset: Address, name: Symbol, icon: Symbol, description: Symbol) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut metadata: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "metadata")).unwrap_or_else(|| Map::new(env));
        metadata.set(asset.clone(), name);
        env.storage().instance().set(&Symbol::new(&env, "metadata"), &metadata);

        let mut icons: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "icons")).unwrap_or_else(|| Map::new(env));
        icons.set(asset.clone(), icon);
        env.storage().instance().set(&Symbol::new(&env, "icons"), &icons);

        let mut descriptions: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "descriptions")).unwrap_or_else(|| Map::new(env));
        descriptions.set(asset, description);
        env.storage().instance().set(&Symbol::new(&env, "descriptions"), &descriptions);
    }

    pub fn get_name(env: Env, asset: Address) -> Option<Symbol> {
        let metadata: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "metadata")).unwrap_or_else(|| Map::new(&env));
        metadata.get(asset)
    }

    pub fn get_icon(env: Env, asset: Address) -> Option<Symbol> {
        let icons: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "icons")).unwrap_or_else(|| Map::new(&env));
        icons.get(asset)
    }

    pub fn get_description(env: Env, asset: Address) -> Option<Symbol> {
        let descriptions: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "descriptions")).unwrap_or_else(|| Map::new(&env));
        descriptions.get(asset)
    }

    pub fn has_metadata(env: Env, asset: Address) -> bool {
        let metadata: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "metadata")).unwrap_or_else(|| Map::new(&env));
        metadata.get(asset).is_some()
    }

    pub fn remove_metadata(&self, env: &Env, asset: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut metadata: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "metadata")).unwrap_or_else(|| Map::new(env));
        metadata.set(asset.clone(), Symbol::new(&env, ""));

        let mut icons: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "icons")).unwrap_or_else(|| Map::new(env));
        icons.set(asset.clone(), Symbol::new(&env, ""));

        let mut descriptions: Map<Address, Symbol> =
            env.storage().instance().get(&Symbol::new(&env, "descriptions")).unwrap_or_else(|| Map::new(env));
        descriptions.set(asset, Symbol::new(&env, ""));

        env.storage().instance().set(&Symbol::new(&env, "metadata"), &metadata);
        env.storage().instance().set(&Symbol::new(&env, "icons"), &icons);
        env.storage().instance().set(&Symbol::new(&env, "descriptions"), &descriptions);
pub struct DelegationContract;

#[contractimpl]
impl DelegationContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&"admin") {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&"admin", &admin);
        env.storage().instance().set(&"power", &Map::<Address, i128>::new(&env));
        env.storage().instance().set(&"delegates", &Map::<Address, Address>::new(&env));
    }

    pub fn set_voting_power(&self, env: &Env, voter: Address, power: i128) {
        let admin: Address = env.storage().instance().get(&"admin").unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        if power < 0 {
            panic!("Voting power cannot be negative");
        }
        let mut powers: Map<Address, i128> = env.storage().instance().get(&"power").unwrap_or_else(|| Map::new(env));
        powers.set(voter, power);
        env.storage().instance().set(&"power", &powers);
    }

    pub fn delegate(&self, env: &Env, delegator: Address, representative: Address) {
        delegator.require_auth();
        if delegator == representative {
            panic!("Cannot delegate to self");
        }

        let delegates: Map<Address, Address> = env.storage().instance().get(&"delegates").unwrap_or_else(|| Map::new(env));
        let mut cursor = representative.clone();
        for _ in 0..100 {
            if cursor == delegator {
                panic!("Delegation cycle detected");
            }
            match delegates.get(cursor.clone()) {
                Some(next) => cursor = next,
                None => break,
            }
        }
        let mut updated = delegates;
        updated.set(delegator, representative);
        env.storage().instance().set(&"delegates", &updated);
    }

    pub fn clear_delegation(&self, env: &Env, delegator: Address) {
        delegator.require_auth();
        let mut delegates: Map<Address, Address> = env.storage().instance().get(&"delegates").unwrap_or_else(|| Map::new(env));
        delegates.remove(delegator);
        env.storage().instance().set(&"delegates", &delegates);
    }

    pub fn get_delegate(env: Env, delegator: Address) -> Option<Address> {
        let delegates: Map<Address, Address> = env.storage().instance().get(&"delegates").unwrap_or_else(|| Map::new(&env));
        delegates.get(delegator)
    }

    pub fn get_voting_power(env: Env, representative: Address) -> i128 {
        let powers: Map<Address, i128> = env.storage().instance().get(&"power").unwrap_or_else(|| Map::new(&env));
        let delegates: Map<Address, Address> = env.storage().instance().get(&"delegates").unwrap_or_else(|| Map::new(&env));
        let mut total = powers.get(representative.clone()).unwrap_or(0);
        for (voter, power) in powers.iter() {
            let mut cursor = voter;
            for _ in 0..100 {
                match delegates.get(cursor.clone()) {
                    Some(next) => {
                        if next == representative {
                            total = total.checked_add(power).unwrap_or_else(|| panic!("Voting power overflow"));
                            break;
                        }
                        cursor = next;
                    }
                    None => break,
                }
            }
        }
        total
    }
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub author: Address,
    pub title: Symbol,
    pub start_time: u64,
    pub end_time: u64,
    pub executed: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct LockedQuote {
    pub creator: Address,
    pub sell_asset: Address,
    pub buy_asset: Address,
    pub sell_amount: i128,
    pub buy_amount: i128,
    pub price: i128,
    pub expires_at: u64,
    pub executed: bool,
}

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    pub fn initialize(env: Env, admin: Address, governance_token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "governance_token"), &governance_token);
        env.storage().instance().set(&Symbol::new(&env, "proposal_count"), &0u32);
        env.storage().instance().set(&Symbol::new(&env, "quorum_bps"), &1000u32);
        env.storage().instance().set(&Symbol::new(&env, "proposals"), &Map::<u32, Proposal>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "votes_for"), &Map::<u32, i128>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "votes_against"), &Map::<u32, i128>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "has_voted"), &Map::<(u32, Address), bool>::new(&env));
    }

    pub fn create_proposal(&self, env: &Env, author: Address, title: Symbol, duration: u64) {
        author.require_auth();

        let current_time = env.ledger().timestamp();
        let mut proposal_count: u32 = env.storage().instance().get(&Symbol::new(&env, "proposal_count")).unwrap_or(0);
        let id = proposal_count + 1;

        let proposal = Proposal {
            id,
            author: author.clone(),
            title: title.clone(),
            start_time: current_time,
            end_time: current_time + duration,
            executed: false,
        };

        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&Symbol::new(&env, "proposals")).unwrap_or_else(|| Map::new(env));
        proposals.set(id, proposal);
        env.storage().instance().set(&Symbol::new(&env, "proposals"), &proposals);
        env.storage().instance().set(&Symbol::new(&env, "proposal_count"), &id);

        let mut votes_for: Map<u32, i128> =
            env.storage().instance().get(&Symbol::new(&env, "votes_for")).unwrap_or_else(|| Map::new(env));
        votes_for.set(id, 0);
        env.storage().instance().set(&Symbol::new(&env, "votes_for"), &votes_for);

        let mut votes_against: Map<u32, i128> =
            env.storage().instance().get(&Symbol::new(&env, "votes_against")).unwrap_or_else(|| Map::new(env));
        votes_against.set(id, 0);
        env.storage().instance().set(&Symbol::new(&env, "votes_against"), &votes_against);

        env.events().publish(
            (Symbol::new(&env, "proposal_created"), &author),
            (id, title),
        );
    }

    pub fn cast_vote(&self, env: &Env, proposal_id: u32, voter: Address, in_favor: bool) {
        voter.require_auth();

        let proposals: Map<u32, Proposal> =
            env.storage().instance().get(&Symbol::new(&env, "proposals")).unwrap_or_else(|| Map::new(env));
        let proposal = proposals.get(proposal_id).unwrap_or_else(|| panic!("Proposal not found"));

        let current_time = env.ledger().timestamp();
        if current_time < proposal.start_time || current_time > proposal.end_time {
            panic!("Voting period is not active");
        }

        let has_voted: Map<(u32, Address), bool> =
            env.storage().instance().get(&Symbol::new(&env, "has_voted")).unwrap_or_else(|| Map::new(env));
        if has_voted.get((proposal_id, voter.clone())).unwrap_or(false) {
            panic!("Voter has already voted on this proposal");
        }

        let governance_token: Address = env.storage().instance().get(&Symbol::new(&env, "governance_token")).unwrap();
        let vote_weight: i128 = env.invoke_contract(&governance_token, &Symbol::new(&env, "balance"), (&voter,));

        if vote_weight <= 0 {
            panic!("Voter has no governance tokens");
        }

        if in_favor {
            let mut votes_for: Map<u32, i128> =
                env.storage().instance().get(&Symbol::new(&env, "votes_for")).unwrap_or_else(|| Map::new(env));
            let current = votes_for.get(proposal_id).unwrap_or(0);
            votes_for.set(proposal_id, current + vote_weight);
            env.storage().instance().set(&Symbol::new(&env, "votes_for"), &votes_for);
        } else {
            let mut votes_against: Map<u32, i128> =
                env.storage().instance().get(&Symbol::new(&env, "votes_against")).unwrap_or_else(|| Map::new(env));
            let current = votes_against.get(proposal_id).unwrap_or(0);
            votes_against.set(proposal_id, current + vote_weight);
            env.storage().instance().set(&Symbol::new(&env, "votes_against"), &votes_against);
        }

        let mut has_voted_mut: Map<(u32, Address), bool> =
            env.storage().instance().get(&Symbol::new(&env, "has_voted")).unwrap_or_else(|| Map::new(env));
        has_voted_mut.set((proposal_id, voter.clone()), true);
        env.storage().instance().set(&Symbol::new(&env, "has_voted"), &has_voted_mut);

        env.events().publish(
            (Symbol::new(&env, "vote_cast"), &voter),
            (proposal_id, in_favor, vote_weight),
        );
    }

    pub fn execute_proposal(&self, env: &Env, proposal_id: u32) {
        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&Symbol::new(&env, "proposals")).unwrap_or_else(|| Map::new(env));
        let mut proposal = proposals.get(proposal_id).unwrap_or_else(|| panic!("Proposal not found"));

        if proposal.executed {
            panic!("Proposal already executed");
        }

        let current_time = env.ledger().timestamp();
        if current_time <= proposal.end_time {
            panic!("Voting period has not ended");
        }

        let votes_for: Map<u32, i128> =
            env.storage().instance().get(&Symbol::new(&env, "votes_for")).unwrap_or_else(|| Map::new(&env));
        let votes_against: Map<u32, i128> =
            env.storage().instance().get(&Symbol::new(&env, "votes_against")).unwrap_or_else(|| Map::new(&env));

        let for_votes = votes_for.get(proposal_id).unwrap_or(0);
        let against_votes = votes_against.get(proposal_id).unwrap_or(0);

        if for_votes <= against_votes {
            proposal.executed = true;
            proposals.set(proposal_id, proposal);
            env.storage().instance().set(&Symbol::new(&env, "proposals"), &proposals);
            env.events().publish(
                (Symbol::new(&env, "proposal_rejected"), &proposal.author),
                (proposal_id, for_votes, against_votes),
            );
            return;
        }

        proposal.executed = true;
        proposals.set(proposal_id, proposal);
        env.storage().instance().set(&Symbol::new(&env, "proposals"), &proposals);

        env.events().publish(
            (Symbol::new(&env, "proposal_executed"), &proposal.author),
            (proposal_id, for_votes, against_votes),
        );
    }

    pub fn get_proposal(env: Env, proposal_id: u32) -> Proposal {
        let proposals: Map<u32, Proposal> =
            env.storage().instance().get(&Symbol::new(&env, "proposals")).unwrap_or_else(|| Map::new(&env));
        proposals.get(proposal_id).unwrap_or_else(|| panic!("Proposal not found"))
    }

    pub fn get_vote_tally(env: Env, proposal_id: u32) -> (i128, i128) {
        let votes_for: Map<u32, i128> =
            env.storage().instance().get(&Symbol::new(&env, "votes_for")).unwrap_or_else(|| Map::new(&env));
        let votes_against: Map<u32, i128> =
            env.storage().instance().get(&Symbol::new(&env, "votes_against")).unwrap_or_else(|| Map::new(&env));
        let for_votes = votes_for.get(proposal_id).unwrap_or(0);
        let against_votes = votes_against.get(proposal_id).unwrap_or(0);
        (for_votes, against_votes)
    }

    pub fn has_voted(env: Env, proposal_id: u32, voter: Address) -> bool {
        let has_voted_map: Map<(u32, Address), bool> =
            env.storage().instance().get(&Symbol::new(&env, "has_voted")).unwrap_or_else(|| Map::new(&env));
        has_voted_map.get((proposal_id, voter)).unwrap_or(false)
    }

    pub fn get_proposal_count(env: Env) -> u32 {
        env.storage().instance().get(&Symbol::new(&env, "proposal_count")).unwrap_or(0)
    }

    pub fn set_quorum(&self, env: &Env, quorum_bps: u32) {
        let admin: Address = env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        if quorum_bps > 10_000 {
            panic!("Quorum must be between 0 and 10000 basis points");
        }
        env.storage().instance().set(&Symbol::new(&env, "quorum_bps"), &quorum_bps);
    }
}

#[contract]
pub struct QuoteLockContract;

#[contractimpl]
impl QuoteLockContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&"admin") {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&"admin", &admin);
        env.storage().instance().set(&"quotes", &Map::<Symbol, LockedQuote>::new(&env));
    }

    pub fn lock_quote(&self, env: &Env, id: Symbol, creator: Address, sell_asset: Address, buy_asset: Address, sell_amount: i128, buy_amount: i128, price: i128, expires_at: u64) {
        creator.require_auth();
        if sell_amount <= 0 || buy_amount <= 0 || price <= 0 {
            panic!("Quote amounts and price must be positive");
        }
        if expires_at <= env.ledger().timestamp() {
            panic!("Quote expiry must be in the future");
        }
        let mut quotes: Map<Symbol, LockedQuote> = env.storage().instance().get(&"quotes").unwrap_or_else(|| Map::new(env));
        if quotes.contains_key(id.clone()) {
            panic!("Quote already exists");
        }
        quotes.set(id, LockedQuote { creator, sell_asset, buy_asset, sell_amount, buy_amount, price, expires_at, executed: false });
        env.storage().instance().set(&"quotes", &quotes);
    }

    pub fn execute_quote(&self, env: &Env, id: Symbol, executor: Address) -> LockedQuote {
        executor.require_auth();
        let mut quotes: Map<Symbol, LockedQuote> = env.storage().instance().get(&"quotes").unwrap_or_else(|| Map::new(env));
        let mut quote = quotes.get(id.clone()).unwrap_or_else(|| panic!("Quote not found"));
        if quote.executed {
            panic!("Quote already executed");
        }
        if env.ledger().timestamp() >= quote.expires_at {
            panic!("Quote has expired");
        }
        if quote.creator != executor {
            panic!("Only quote creator can execute");
        }
        quote.executed = true;
        quotes.set(id, quote.clone());
        env.storage().instance().set(&"quotes", &quotes);
        quote
    }

    pub fn get_quote(env: Env, id: Symbol) -> LockedQuote {
        let quotes: Map<Symbol, LockedQuote> = env.storage().instance().get(&"quotes").unwrap_or_else(|| panic!("Quote not found"));
        quotes.get(id).unwrap_or_else(|| panic!("Quote not found"))
    }
}
        }
        quote.executed = true;
        quotes.set(id, quote.clone());
        env.storage().instance().set(&"quotes", &quotes);
        quote
    }

    pub fn get_quote(env: Env, id: Symbol) -> LockedQuote {
        let quotes: Map<Symbol, LockedQuote> = env.storage().instance().get(&"quotes").unwrap_or_else(|| panic!("Quote not found"));
        quotes.get(id).unwrap_or_else(|| panic!("Quote not found"))
    }
}


// =============================================================================
// Issue #488: Core payment contract for on-chain XLM and asset transfers
// with authorization, amount validation, and event emission.
// =============================================================================

const PAYMENT_TOKEN_KEY: &str = "payment_token";
const PAYMENT_ADMIN_KEY: &str = "payment_admin";
const PAYMENT_COUNT_KEY: &str = "payment_count";

#[contract]
pub struct PaymentContract;

#[contractimpl]
impl PaymentContract {
    /// Initialize the payment contract with an admin and the token to transfer.
    /// Must be called once after deployment before any other function.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, PAYMENT_ADMIN_KEY)) {
            panic!("PaymentContract: already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, PAYMENT_ADMIN_KEY), &admin);
        env.storage().instance().set(&Symbol::new(&env, PAYMENT_TOKEN_KEY), &token);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, PAYMENT_COUNT_KEY), &Map::<Address, u32>::new(&env));
    }

    /// Send `amount` units of the configured token from `sender` to `recipient`.
    ///
    /// - Requires `sender` authorization.
    /// - Validates that `amount > 0`.
    /// - Transfers via the token contract's `transfer` entry-point.
    /// - Emits a `payment_sent` event carrying (sender, recipient, amount, memo).
    pub fn send_payment(
        env: Env,
        sender: Address,
        recipient: Address,
        amount: i128,
        memo: Symbol,
    ) {
        // Authorization & validation.
        sender.require_auth();
        if amount <= 0 {
            panic!("PaymentContract: amount must be greater than zero");
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, PAYMENT_TOKEN_KEY))
            .unwrap_or_else(|| panic!("PaymentContract: not initialized"));

        // Transfer via the token contract.
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (sender.clone(), recipient.clone(), amount),
        );

        // Increment the sender's payment count.
        Self::increment_payment_count(&env, &sender);

        // Emit payment_sent event.
        env.events().publish(
            (Symbol::new(&env, "payment_sent"), sender.clone()),
            (recipient, amount, memo),
        );
    }

    /// Send `amounts[i]` units of the token from `sender` to each `recipients[i]`.
    ///
    /// - Requires `sender` authorization once for the whole batch.
    /// - Validates that `recipients` and `amounts` are the same length.
    /// - Validates that every amount > 0.
    /// - Emits a single `batch_payment_sent` event on success.
    pub fn batch_send(
        env: Env,
        sender: Address,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) {
        sender.require_auth();

        if recipients.len() != amounts.len() {
            panic!("PaymentContract: recipients and amounts length mismatch");
        }
        if recipients.is_empty() {
            panic!("PaymentContract: recipients list must not be empty");
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, PAYMENT_TOKEN_KEY))
            .unwrap_or_else(|| panic!("PaymentContract: not initialized"));

        for i in 0..recipients.len() {
            let recipient = recipients.get(i).unwrap();
            let amount = amounts.get(i).unwrap();
            if amount <= 0 {
                panic!("PaymentContract: each amount must be greater than zero");
            }
            env.invoke_contract::<()>(
                &token,
                &Symbol::new(&env, "transfer"),
                (sender.clone(), recipient, amount),
            );
            Self::increment_payment_count(&env, &sender);
        }

        // Emit batch_payment_sent event.
        env.events().publish(
            (Symbol::new(&env, "batch_payment_sent"), sender.clone()),
            (recipients, amounts),
        );
    }

    /// Returns the total number of payments (individual + batch entries) made by `address`.
    pub fn get_payment_count(env: Env, address: Address) -> u32 {
        let counts: Map<Address, u32> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, PAYMENT_COUNT_KEY))
            .unwrap_or_else(|| Map::new(&env));
        counts.get(address).unwrap_or(0)
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    fn increment_payment_count(env: &Env, address: &Address) {
        let mut counts: Map<Address, u32> = env
            .storage()
            .instance()
            .get(&Symbol::new(env, PAYMENT_COUNT_KEY))
            .unwrap_or_else(|| Map::new(env));
        let current = counts.get(address.clone()).unwrap_or(0);
        counts.set(address.clone(), current + 1);
        env.storage()
            .instance()
            .set(&Symbol::new(env, PAYMENT_COUNT_KEY), &counts);
    }
}

// =============================================================================
// Issue #493 — Milestone-release escrow logic
// Locks funds per campaign milestone and releases them when conditions are met.
// Status values: PENDING=0, ACTIVE=1, COMPLETED=2
// =============================================================================

#[contracttype]
#[derive(Clone)]
pub struct MilestoneEscrowEntry {
    pub recipient: Address,
    pub amount: i128,
    pub status: u32, // 0=PENDING, 1=ACTIVE, 2=COMPLETED
}

#[contract]
pub struct MilestoneEscrowContract;

#[contractimpl]
impl MilestoneEscrowContract {
    /// Initialize with an admin address and the token contract to use for transfers.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(
            &Symbol::new(&env, "milestones"),
            &Map::<u32, MilestoneEscrowEntry>::new(&env),
        );
    }

    /// Admin creates a milestone in PENDING status with a designated recipient and target amount.
    pub fn create_milestone(env: Env, id: u32, recipient: Address, amount: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        let mut milestones: Map<u32, MilestoneEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "milestones"))
            .unwrap_or_else(|| Map::new(&env));
        if milestones.contains_key(id) {
            panic!("Milestone already exists");
        }
        milestones.set(
            id,
            MilestoneEscrowEntry {
                recipient,
                amount,
                status: 0, // PENDING
            },
        );
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "milestones"), &milestones);
    }

    /// Funder transfers tokens to the contract for this milestone, activating it (status → ACTIVE).
    pub fn lock_funds(env: Env, id: u32, funder: Address, amount: i128) {
        funder.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        let mut milestones: Map<u32, MilestoneEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "milestones"))
            .unwrap_or_else(|| Map::new(&env));
        let mut entry = milestones
            .get(id)
            .unwrap_or_else(|| panic!("Milestone not found"));
        if entry.status != 0 {
            panic!("Milestone must be PENDING to lock funds");
        }
        if amount != entry.amount {
            panic!("Must fund exact milestone amount");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (funder, escrow, amount),
        );
        entry.status = 1; // ACTIVE
        milestones.set(id, entry);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "milestones"), &milestones);
        env.events().publish(
            (Symbol::new(&env, "milestone_locked"), id),
            amount,
        );
    }

    /// Admin marks a milestone COMPLETED and releases the escrowed funds to the recipient.
    pub fn complete_milestone(env: Env, id: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut milestones: Map<u32, MilestoneEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "milestones"))
            .unwrap_or_else(|| Map::new(&env));
        let mut entry = milestones
            .get(id)
            .unwrap_or_else(|| panic!("Milestone not found"));
        if entry.status != 1 {
            panic!("Milestone must be ACTIVE to complete");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (escrow, entry.recipient.clone(), entry.amount),
        );
        entry.status = 2; // COMPLETED
        milestones.set(id, entry.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "milestones"), &milestones);
        env.events().publish(
            (Symbol::new(&env, "milestone_completed"), id),
            entry.amount,
        );
    }

    /// Returns the status of a milestone: 0=PENDING, 1=ACTIVE, 2=COMPLETED.
    pub fn get_milestone_status(env: Env, id: u32) -> u32 {
        let milestones: Map<u32, MilestoneEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "milestones"))
            .unwrap_or_else(|| Map::new(&env));
        milestones
            .get(id)
            .unwrap_or_else(|| panic!("Milestone not found"))
            .status
    }
}

// =============================================================================
// Issue #494 — Dispute-triggered escrow freeze
// Admin can freeze/unfreeze an escrow entry, blocking release while frozen.
// Moves dispute enforcement from DB-only to on-chain.
// =============================================================================

#[contracttype]
#[derive(Clone)]
pub struct DisputeEscrowEntry {
    pub depositor: Address,
    pub amount: i128,
    pub frozen: bool,
}

#[contract]
pub struct DisputeEscrowContract;

#[contractimpl]
impl DisputeEscrowContract {
    /// Initialize with an admin address and the token contract.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(
            &Symbol::new(&env, "escrows"),
            &Map::<u32, DisputeEscrowEntry>::new(&env),
        );
    }

    /// Depositor locks funds in the escrow. Entry starts unfrozen.
    pub fn deposit(env: Env, id: u32, depositor: Address, amount: i128) {
        depositor.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        let mut escrows: Map<u32, DisputeEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        if escrows.contains_key(id) {
            panic!("Escrow already exists for this id");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (depositor.clone(), escrow, amount),
        );
        escrows.set(
            id,
            DisputeEscrowEntry {
                depositor,
                amount,
                frozen: false,
            },
        );
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "dispute_deposit"), id),
            amount,
        );
    }

    /// Admin freezes the escrow when a dispute is filed, blocking release.
    pub fn freeze(env: Env, id: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut escrows: Map<u32, DisputeEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let mut entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        if entry.frozen {
            panic!("Escrow already frozen");
        }
        entry.frozen = true;
        escrows.set(id, entry);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "escrow_frozen"), id),
            (),
        );
    }

    /// Admin unfreezes the escrow once a dispute is resolved.
    pub fn unfreeze(env: Env, id: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut escrows: Map<u32, DisputeEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let mut entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        if !entry.frozen {
            panic!("Escrow is not frozen");
        }
        entry.frozen = false;
        escrows.set(id, entry);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "escrow_unfrozen"), id),
            (),
        );
    }

    /// Releases funds to the given recipient. Reverts if the escrow is frozen.
    pub fn release(env: Env, id: u32, recipient: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut escrows: Map<u32, DisputeEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        if entry.frozen {
            panic!("Escrow is frozen due to an open dispute");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (escrow, recipient.clone(), entry.amount),
        );
        escrows.remove(id);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "dispute_released"), id),
            entry.amount,
        );
    }

    /// Returns whether the escrow for the given id is currently frozen.
    pub fn is_frozen(env: Env, id: u32) -> bool {
        let escrows: Map<u32, DisputeEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"))
            .frozen
    }
}

// =============================================================================
// Issue #495 — Admin recovery for escrowed funds
// A dedicated recovery_admin role (separate from the campaign admin) can
// redirect escrowed funds if the campaign creator's key is lost.
// =============================================================================

#[contracttype]
#[derive(Clone)]
pub struct RecoveryEscrowEntry {
    pub depositor: Address,
    pub amount: i128,
}

#[contract]
pub struct AdminRecoveryEscrowContract;

#[contractimpl]
impl AdminRecoveryEscrowContract {
    /// Initialize with a primary admin, a recovery admin, and the token contract.
    /// The recovery_admin is a separate key with the sole power to redirect funds.
    pub fn initialize(env: Env, admin: Address, recovery_admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "recovery_admin"), &recovery_admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(
            &Symbol::new(&env, "escrows"),
            &Map::<u32, RecoveryEscrowEntry>::new(&env),
        );
    }

    /// Depositor locks funds in the escrow.
    pub fn deposit(env: Env, id: u32, depositor: Address, amount: i128) {
        depositor.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        let mut escrows: Map<u32, RecoveryEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        if escrows.contains_key(id) {
            panic!("Escrow already exists for this id");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (depositor.clone(), escrow, amount),
        );
        escrows.set(id, RecoveryEscrowEntry { depositor, amount });
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "recovery_deposit"), id),
            amount,
        );
    }

    /// Primary admin releases funds to an intended recipient under normal circumstances.
    pub fn release(env: Env, id: u32, recipient: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut escrows: Map<u32, RecoveryEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (escrow, recipient.clone(), entry.amount),
        );
        escrows.remove(id);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "recovery_released"), id),
            entry.amount,
        );
    }

    /// Recovery admin redirects funds to a new recipient when the campaign creator's key is lost.
    /// This function is exclusively callable by the recovery_admin, not the primary admin.
    pub fn emergency_recover(env: Env, id: u32, new_recipient: Address) {
        let recovery_admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "recovery_admin"))
            .unwrap_or_else(|| panic!("Recovery admin not set"));
        recovery_admin.require_auth();
        let mut escrows: Map<u32, RecoveryEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (escrow, new_recipient.clone(), entry.amount),
        );
        escrows.remove(id);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "emergency_recovered"), id),
            (entry.amount, new_recipient),
        );
    }

    /// Recovery admin rotates to a new recovery_admin address for key-rotation purposes.
    pub fn transfer_recovery_admin(env: Env, new_recovery_admin: Address) {
        let recovery_admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "recovery_admin"))
            .unwrap_or_else(|| panic!("Recovery admin not set"));
        recovery_admin.require_auth();
        if recovery_admin == new_recovery_admin {
            panic!("New recovery admin must differ from current");
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "recovery_admin"), &new_recovery_admin);
        env.events().publish(
            (Symbol::new(&env, "recovery_admin_transferred"), &recovery_admin),
            &new_recovery_admin,
        );
    }
}

// =============================================================================
// Issue #496 — Escrow expiration / TTL
// Each deposit carries an expires_at timestamp. After expiry, release() is
// blocked and reclaim() lets the original depositor retrieve their funds,
// preventing funds from being locked forever on abandoned campaigns.
// =============================================================================

#[contracttype]
#[derive(Clone)]
pub struct ExpiringEscrowEntry {
    pub depositor: Address,
    pub amount: i128,
    pub expires_at: u64,
}

#[contract]
pub struct ExpiringEscrowContract;

#[contractimpl]
impl ExpiringEscrowContract {
    /// Initialize with an admin address and the token contract.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(
            &Symbol::new(&env, "escrows"),
            &Map::<u32, ExpiringEscrowEntry>::new(&env),
        );
    }

    /// Depositor locks funds with an on-chain expiry timestamp.
    /// expires_at must be strictly in the future (greater than current ledger timestamp).
    pub fn deposit(env: Env, id: u32, depositor: Address, amount: i128, expires_at: u64) {
        depositor.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        if expires_at <= env.ledger().timestamp() {
            panic!("Expiry must be in the future");
        }
        let mut escrows: Map<u32, ExpiringEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        if escrows.contains_key(id) {
            panic!("Escrow already exists for this id");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (depositor.clone(), escrow, amount),
        );
        escrows.set(
            id,
            ExpiringEscrowEntry {
                depositor,
                amount,
                expires_at,
            },
        );
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "expiring_deposit"), id),
            (amount, expires_at),
        );
    }

    /// Admin releases funds before expiry. Reverts if the escrow has already expired.
    pub fn release(env: Env, id: u32, recipient: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut escrows: Map<u32, ExpiringEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        if env.ledger().timestamp() >= entry.expires_at {
            panic!("Escrow has expired; use reclaim instead");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (escrow, recipient.clone(), entry.amount),
        );
        escrows.remove(id);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "expiring_released"), id),
            entry.amount,
        );
    }

    /// Original depositor reclaims funds after the TTL has elapsed.
    /// Only callable by the original depositor, and only after expiry.
    pub fn reclaim(env: Env, id: u32, original_depositor: Address) {
        original_depositor.require_auth();
        let mut escrows: Map<u32, ExpiringEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        if entry.depositor != original_depositor {
            panic!("Only the original depositor can reclaim");
        }
        if env.ledger().timestamp() < entry.expires_at {
            panic!("Escrow has not yet expired");
        }
        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (escrow, original_depositor.clone(), entry.amount),
        );
        escrows.remove(id);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "escrows"), &escrows);
        env.events().publish(
            (Symbol::new(&env, "expiring_reclaimed"), id),
            entry.amount,
        );
    }

    /// Returns true if the escrow TTL has elapsed.
    pub fn is_expired(env: Env, id: u32) -> bool {
        let escrows: Map<u32, ExpiringEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        let entry = escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"));
        env.ledger().timestamp() >= entry.expires_at
    }

    /// Returns the expiry timestamp for the given escrow id.
    pub fn get_expiry(env: Env, id: u32) -> u64 {
        let escrows: Map<u32, ExpiringEscrowEntry> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "escrows"))
            .unwrap_or_else(|| Map::new(&env));
        escrows
            .get(id)
            .unwrap_or_else(|| panic!("Escrow not found"))
            .expires_at
    }
}

// ============================================================================
// Issue #489: CampaignDonationEscrowContract
// Holds donated funds on-chain per campaign and releases them to the campaign
// creator only when the admin confirms milestone completion.
// ============================================================================

#[contracttype]
#[derive(Clone)]
pub struct CampaignBalance {
    pub amount: i128,
}

#[contract]
pub struct CampaignDonationEscrowContract;

#[contractimpl]
impl CampaignDonationEscrowContract {
    /// Initialize the escrow contract with an admin and the SEP-41 token to hold.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(
            &Symbol::new(&env, "balances"),
            &Map::<Symbol, i128>::new(&env),
        );
    }

    /// Donor transfers `amount` tokens into escrow, credited to `campaign_id`.
    pub fn donate(env: Env, campaign_id: Symbol, donor: Address, amount: i128) {
        if amount <= 0 {
            panic!("Donation amount must be positive");
        }
        donor.require_auth();

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();

        // Pull funds from donor into this contract
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (donor.clone(), escrow, amount),
        );

        // Update campaign balance
        let mut balances: Map<Symbol, i128> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "balances"))
            .unwrap_or_else(|| Map::new(&env));
        let current = balances.get(campaign_id.clone()).unwrap_or(0);
        balances.set(campaign_id.clone(), current + amount);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "balances"), &balances);

        env.events().publish(
            (Symbol::new(&env, "donation_received"), &donor),
            (campaign_id, amount),
        );
    }

    /// Admin releases the full escrowed balance for `campaign_id` to `creator`.
    /// Called after milestone verification off-chain (or by a milestone contract).
    pub fn release_to_campaign(env: Env, campaign_id: Symbol, creator: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut balances: Map<Symbol, i128> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "balances"))
            .unwrap_or_else(|| Map::new(&env));
        let balance = balances.get(campaign_id.clone()).unwrap_or(0);
        if balance <= 0 {
            panic!("No funds to release for campaign");
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let escrow = env.current_contract_address();

        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (escrow, creator.clone(), balance),
        );

        // Zero out the balance
        balances.set(campaign_id.clone(), 0_i128);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "balances"), &balances);

        env.events().publish(
            (Symbol::new(&env, "funds_released"), &admin),
            (campaign_id, creator, balance),
        );
    }

    /// Returns the current escrowed balance for a campaign.
    pub fn get_balance(env: Env, campaign_id: Symbol) -> i128 {
        let balances: Map<Symbol, i128> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "balances"))
            .unwrap_or_else(|| Map::new(&env));
        balances.get(campaign_id).unwrap_or(0)
    }
}

// ============================================================================
// Issue #490: MultiSigApprovalContract
// High-value payments above `high_value_threshold` require `threshold` distinct
// approvals before the transfer executes. Low-value payments can be force-
// executed by admin immediately.
// ============================================================================

#[contracttype]
#[derive(Clone)]
pub struct PaymentProposal {
    pub proposer: Address,
    pub recipient: Address,
    pub amount: i128,
    pub token: Address,
    pub approval_count: u32,
    pub executed: bool,
}

#[contract]
pub struct MultiSigApprovalContract;

#[contractimpl]
impl MultiSigApprovalContract {
    /// Set up the multi-sig contract.
    /// `threshold`            – number of approvals required for high-value payments.
    /// `high_value_threshold` – amounts >= this value require multi-sig.
    pub fn initialize(
        env: Env,
        admin: Address,
        threshold: u32,
        high_value_threshold: i128,
    ) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        if threshold == 0 {
            panic!("Threshold must be at least 1");
        }
        if high_value_threshold <= 0 {
            panic!("High-value threshold must be positive");
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "threshold"), &threshold);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "hv_threshold"), &high_value_threshold);
        env.storage().instance().set(
            &Symbol::new(&env, "proposals"),
            &Map::<Symbol, PaymentProposal>::new(&env),
        );
        // Map of (proposal_id, approver) -> bool to track unique approvals
        env.storage().instance().set(
            &Symbol::new(&env, "approvals"),
            &Map::<(Symbol, Address), bool>::new(&env),
        );
    }

    /// Propose a payment. The proposer must be authorized (admin or already an
    /// authorized address).
    pub fn propose_payment(
        env: Env,
        id: Symbol,
        proposer: Address,
        recipient: Address,
        amount: i128,
        token: Address,
    ) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        proposer.require_auth();

        // Only admin can propose (extendable to role list)
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        if proposer != admin {
            panic!("Only admin may propose payments");
        }

        let mut proposals: Map<Symbol, PaymentProposal> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proposals"))
            .unwrap_or_else(|| Map::new(&env));
        if proposals.contains_key(id.clone()) {
            panic!("Proposal ID already exists");
        }
        proposals.set(
            id.clone(),
            PaymentProposal {
                proposer: proposer.clone(),
                recipient,
                amount,
                token,
                approval_count: 0,
                executed: false,
            },
        );
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "proposals"), &proposals);

        env.events().publish(
            (Symbol::new(&env, "payment_proposed"), &proposer),
            (id, amount),
        );
    }

    /// Add an approval for `id`. If the approval count reaches `threshold` and
    /// the payment is high-value, the payment executes automatically.
    pub fn approve(env: Env, id: Symbol, approver: Address) {
        approver.require_auth();

        // Deduplicate approvals
        let mut approvals: Map<(Symbol, Address), bool> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "approvals"))
            .unwrap_or_else(|| Map::new(&env));
        let key = (id.clone(), approver.clone());
        if approvals.get(key.clone()).unwrap_or(false) {
            panic!("Already approved");
        }
        approvals.set(key, true);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "approvals"), &approvals);

        let mut proposals: Map<Symbol, PaymentProposal> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proposals"))
            .unwrap_or_else(|| Map::new(&env));
        let mut proposal = proposals
            .get(id.clone())
            .unwrap_or_else(|| panic!("Proposal not found"));
        if proposal.executed {
            panic!("Proposal already executed");
        }

        proposal.approval_count += 1;

        let threshold: u32 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "threshold"))
            .unwrap_or(1);
        let hv_threshold: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "hv_threshold"))
            .unwrap_or(0);

        // Auto-execute when threshold reached for high-value payments
        if proposal.amount >= hv_threshold && proposal.approval_count >= threshold {
            Self::do_execute(&env, &mut proposal);
        }

        proposals.set(id.clone(), proposal.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "proposals"), &proposals);

        env.events().publish(
            (Symbol::new(&env, "approval_added"), &approver),
            (id, proposal.approval_count),
        );
    }

    /// Admin force-executes a payment that is below the high-value threshold
    /// without waiting for multiple approvals.
    pub fn execute_payment(env: Env, id: Symbol) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let hv_threshold: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "hv_threshold"))
            .unwrap_or(0);

        let mut proposals: Map<Symbol, PaymentProposal> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proposals"))
            .unwrap_or_else(|| Map::new(&env));
        let mut proposal = proposals
            .get(id.clone())
            .unwrap_or_else(|| panic!("Proposal not found"));
        if proposal.executed {
            panic!("Proposal already executed");
        }
        if proposal.amount >= hv_threshold {
            panic!("High-value payment requires multi-sig approval");
        }

        Self::do_execute(&env, &mut proposal);
        proposals.set(id.clone(), proposal);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "proposals"), &proposals);

        env.events().publish(
            (Symbol::new(&env, "payment_executed"), &admin),
            id,
        );
    }

    fn do_execute(env: &Env, proposal: &mut PaymentProposal) {
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(
            &proposal.token,
            &Symbol::new(env, "transfer"),
            (escrow, proposal.recipient.clone(), proposal.amount),
        );
        proposal.executed = true;
    }

    /// Returns the current approval count for a proposal.
    pub fn get_approvals(env: Env, id: Symbol) -> u32 {
        let proposals: Map<Symbol, PaymentProposal> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proposals"))
            .unwrap_or_else(|| Map::new(&env));
        proposals
            .get(id)
            .map(|p| p.approval_count)
            .unwrap_or(0)
    }

    /// Returns whether a proposal has been executed.
    pub fn is_executed(env: Env, id: Symbol) -> bool {
        let proposals: Map<Symbol, PaymentProposal> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proposals"))
            .unwrap_or_else(|| Map::new(&env));
        proposals.get(id).map(|p| p.executed).unwrap_or(false)
    }
}

// ============================================================================
// Issue #491: HTLCContract — Hash Time Lock Contract
// Provides atomic cross-asset swap guarantees. The sender locks funds with a
// SHA-256 hashlock; the recipient claims with the preimage. If the timelock
// expires the sender may reclaim.
// ============================================================================

#[contracttype]
#[derive(Clone)]
pub struct HtlcLock {
    pub sender: Address,
    pub recipient: Address,
    pub amount: i128,
    pub hashlock: BytesN<32>,
    pub timelock: u64,
    /// 0 = active, 1 = withdrawn, 2 = refunded
    pub status: u32,
}

#[contract]
pub struct HTLCContract;

#[contractimpl]
impl HTLCContract {
    /// Initialize the HTLC contract with an admin and the token it will lock.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(
            &Symbol::new(&env, "locks"),
            &Map::<Symbol, HtlcLock>::new(&env),
        );
    }

    /// Sender locks `amount` tokens under `id`.
    /// `hashlock` – SHA-256 hash of the preimage the recipient must reveal.
    /// `timelock`  – ledger timestamp after which the sender may refund.
    pub fn lock(
        env: Env,
        id: Symbol,
        sender: Address,
        recipient: Address,
        amount: i128,
        hashlock: BytesN<32>,
        timelock: u64,
    ) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        if timelock <= env.ledger().timestamp() {
            panic!("Timelock must be in the future");
        }
        sender.require_auth();

        let mut locks: Map<Symbol, HtlcLock> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "locks"))
            .unwrap_or_else(|| Map::new(&env));
        if locks.contains_key(id.clone()) {
            panic!("Lock ID already exists");
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let contract_addr = env.current_contract_address();

        // Pull tokens into contract escrow
        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (sender.clone(), contract_addr, amount),
        );

        locks.set(
            id.clone(),
            HtlcLock {
                sender: sender.clone(),
                recipient,
                amount,
                hashlock,
                timelock,
                status: 0,
            },
        );
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "locks"), &locks);

        env.events().publish(
            (Symbol::new(&env, "htlc_locked"), &sender),
            (id, amount),
        );
    }

    /// Recipient reveals the 32-byte preimage to withdraw locked funds.
    /// The contract verifies sha256(preimage) == hashlock.
    pub fn withdraw(env: Env, id: Symbol, preimage: BytesN<32>) {
        let mut locks: Map<Symbol, HtlcLock> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "locks"))
            .unwrap_or_else(|| Map::new(&env));
        let mut htlc = locks
            .get(id.clone())
            .unwrap_or_else(|| panic!("Lock not found"));

        if htlc.status != 0 {
            panic!("Lock is not active");
        }

        // Verify preimage: sha256(preimage) must equal hashlock
        let hash = env.crypto().sha256(&preimage.into());
        let hash_bytes: BytesN<32> = BytesN::from_array(&env, &hash.to_array());
        if hash_bytes != htlc.hashlock {
            panic!("Invalid preimage");
        }

        htlc.recipient.require_auth();

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let contract_addr = env.current_contract_address();

        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (contract_addr, htlc.recipient.clone(), htlc.amount),
        );

        htlc.status = 1; // withdrawn
        locks.set(id.clone(), htlc.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "locks"), &locks);

        env.events().publish(
            (Symbol::new(&env, "htlc_withdrawn"), &htlc.recipient),
            (id, htlc.amount),
        );
    }

    /// Sender reclaims funds after the timelock has expired.
    pub fn refund(env: Env, id: Symbol) {
        let mut locks: Map<Symbol, HtlcLock> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "locks"))
            .unwrap_or_else(|| Map::new(&env));
        let mut htlc = locks
            .get(id.clone())
            .unwrap_or_else(|| panic!("Lock not found"));

        if htlc.status != 0 {
            panic!("Lock is not active");
        }
        if env.ledger().timestamp() < htlc.timelock {
            panic!("Timelock has not expired");
        }

        htlc.sender.require_auth();

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let contract_addr = env.current_contract_address();

        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (contract_addr, htlc.sender.clone(), htlc.amount),
        );

        htlc.status = 2; // refunded
        locks.set(id.clone(), htlc.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "locks"), &locks);

        env.events().publish(
            (Symbol::new(&env, "htlc_refunded"), &htlc.sender),
            (id, htlc.amount),
        );
    }

    /// Returns the status of a lock: 0 = active, 1 = withdrawn, 2 = refunded.
    pub fn get_status(env: Env, id: Symbol) -> u32 {
        let locks: Map<Symbol, HtlcLock> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "locks"))
            .unwrap_or_else(|| Map::new(&env));
        locks
            .get(id)
            .map(|h| h.status)
            .unwrap_or_else(|| panic!("Lock not found"))
    }
}

// ============================================================================
// Issue #492: RefundContract
// Mirrors the Prisma `Donation.REFUNDED` status on-chain. Records payments and
// allows the admin to trigger on-chain refunds back to the original donor.
// ============================================================================

#[contracttype]
#[derive(Clone)]
pub struct DonationRecord {
    pub donor: Address,
    pub amount: i128,
    pub refunded: bool,
}

#[contract]
pub struct RefundContract;

#[contractimpl]
impl RefundContract {
    /// Initialize the refund contract with an admin and the token to refund.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(
            &Symbol::new(&env, "donations"),
            &Map::<Symbol, DonationRecord>::new(&env),
        );
    }

    /// Record a donation payment so the contract knows the donor and amount.
    /// Pulls `amount` tokens from the donor into the contract (mirrors donate flow).
    pub fn record_payment(env: Env, donation_id: Symbol, donor: Address, amount: i128) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        donor.require_auth();

        let mut donations: Map<Symbol, DonationRecord> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "donations"))
            .unwrap_or_else(|| Map::new(&env));
        if donations.contains_key(donation_id.clone()) {
            panic!("Donation ID already recorded");
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let contract_addr = env.current_contract_address();

        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (donor.clone(), contract_addr, amount),
        );

        donations.set(
            donation_id.clone(),
            DonationRecord {
                donor,
                amount,
                refunded: false,
            },
        );
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "donations"), &donations);
    }

    /// Admin processes a refund: transfers the original amount back to the donor
    /// and marks the donation as refunded on-chain.
    pub fn process_refund(env: Env, donation_id: Symbol) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();

        let mut donations: Map<Symbol, DonationRecord> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "donations"))
            .unwrap_or_else(|| Map::new(&env));
        let mut record = donations
            .get(donation_id.clone())
            .unwrap_or_else(|| panic!("Donation not found"));

        if record.refunded {
            panic!("Donation already refunded");
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "token"))
            .unwrap_or_else(|| panic!("Token not set"));
        let contract_addr = env.current_contract_address();

        env.invoke_contract::<()>(
            &token,
            &Symbol::new(&env, "transfer"),
            (contract_addr, record.donor.clone(), record.amount),
        );

        record.refunded = true;
        donations.set(donation_id.clone(), record.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "donations"), &donations);

        env.events().publish(
            (Symbol::new(&env, "refund_processed"), &admin),
            (donation_id, record.donor, record.amount),
        );
    }

    /// Returns `true` if the donation has been refunded on-chain.
    pub fn get_refund_status(env: Env, donation_id: Symbol) -> bool {
        let donations: Map<Symbol, DonationRecord> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "donations"))
            .unwrap_or_else(|| Map::new(&env));
        donations
            .get(donation_id)
            .map(|r| r.refunded)
            .unwrap_or_else(|| panic!("Donation not found"))
    }
}


// ─── Issue #489: Campaign donation escrow ─────────────────────────────────────

#[contract]
pub struct CampaignDonationEscrowContract;

#[contractimpl]
impl CampaignDonationEscrowContract {
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(&Symbol::new(&env, "balances"), &Map::<Symbol, i128>::new(&env));
    }

    /// Donor transfers funds into the escrow for a campaign.
    pub fn donate(&self, env: &Env, campaign_id: Symbol, donor: Address, amount: i128) {
        if amount <= 0 {
            panic!("Donation amount must be positive");
        }
        donor.require_auth();
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (donor.clone(), escrow, amount));
        let mut balances: Map<Symbol, i128> = env
            .storage().instance()
            .get(&Symbol::new(env, "balances"))
            .unwrap_or_else(|| Map::new(env));
        let current = balances.get(campaign_id.clone()).unwrap_or(0);
        balances.set(campaign_id.clone(), current + amount);
        env.storage().instance().set(&Symbol::new(env, "balances"), &balances);
        env.events().publish((Symbol::new(env, "donation_received"), &donor), (campaign_id, amount));
    }

    /// Admin releases accumulated campaign funds to the campaign creator.
    pub fn release_to_campaign(&self, env: &Env, campaign_id: Symbol, creator: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut balances: Map<Symbol, i128> = env
            .storage().instance()
            .get(&Symbol::new(env, "balances"))
            .unwrap_or_else(|| Map::new(env));
        let amount = balances.get(campaign_id.clone()).unwrap_or_else(|| panic!("No funds for campaign"));
        if amount <= 0 {
            panic!("No funds to release");
        }
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (escrow, creator.clone(), amount));
        balances.set(campaign_id.clone(), 0i128);
        env.storage().instance().set(&Symbol::new(env, "balances"), &balances);
        env.events().publish((Symbol::new(env, "funds_released"), &creator), (campaign_id, amount));
    }

    pub fn get_balance(env: Env, campaign_id: Symbol) -> i128 {
        let balances: Map<Symbol, i128> = env
            .storage().instance()
            .get(&Symbol::new(&env, "balances"))
            .unwrap_or_else(|| Map::new(&env));
        balances.get(campaign_id).unwrap_or(0)
    }
}

// ─── Issue #490: Multi-sig payment approval ───────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct PendingPayment {
    pub proposer: Address,
    pub recipient: Address,
    pub amount: i128,
    pub token: Address,
    pub approvals: u32,
    pub executed: bool,
}

#[contract]
pub struct MultiSigApprovalContract;

#[contractimpl]
impl MultiSigApprovalContract {
    pub fn initialize(env: Env, admin: Address, threshold: u32, high_value_threshold: i128) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        if threshold == 0 {
            panic!("Threshold must be at least 1");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "threshold"), &threshold);
        env.storage().instance().set(&Symbol::new(&env, "hv_threshold"), &high_value_threshold);
        env.storage().instance().set(&Symbol::new(&env, "signers"), &Vec::<Address>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "payments"), &Map::<Symbol, PendingPayment>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "approver_votes"), &Map::<(Symbol, Address), bool>::new(&env));
    }

    pub fn add_signer(&self, env: &Env, signer: Address) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut signers: Vec<Address> = env.storage().instance().get(&Symbol::new(env, "signers")).unwrap_or_else(|| Vec::new(env));
        if signers.contains(&signer) {
            panic!("Signer already registered");
        }
        signers.push_back(signer);
        env.storage().instance().set(&Symbol::new(env, "signers"), &signers);
    }

    pub fn propose_payment(&self, env: &Env, id: Symbol, proposer: Address, recipient: Address, amount: i128, token: Address) {
        proposer.require_auth();
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        let signers: Vec<Address> = env.storage().instance().get(&Symbol::new(env, "signers")).unwrap_or_else(|| Vec::new(env));
        if !signers.contains(&proposer) {
            panic!("Proposer is not a registered signer");
        }
        let mut payments: Map<Symbol, PendingPayment> = env.storage().instance().get(&Symbol::new(env, "payments")).unwrap_or_else(|| Map::new(env));
        if payments.contains_key(id.clone()) {
            panic!("Payment proposal already exists");
        }
        payments.set(id.clone(), PendingPayment { proposer: proposer.clone(), recipient, amount, token, approvals: 0, executed: false });
        env.storage().instance().set(&Symbol::new(env, "payments"), &payments);
        env.events().publish((Symbol::new(env, "payment_proposed"), &proposer), (id, amount));
    }

    pub fn approve(&self, env: &Env, id: Symbol, approver: Address) {
        approver.require_auth();
        let signers: Vec<Address> = env.storage().instance().get(&Symbol::new(env, "signers")).unwrap_or_else(|| Vec::new(env));
        if !signers.contains(&approver) {
            panic!("Approver is not a registered signer");
        }
        let mut votes: Map<(Symbol, Address), bool> = env.storage().instance().get(&Symbol::new(env, "approver_votes")).unwrap_or_else(|| Map::new(env));
        if votes.get((id.clone(), approver.clone())).unwrap_or(false) {
            panic!("Approver has already voted");
        }
        votes.set((id.clone(), approver), true);
        env.storage().instance().set(&Symbol::new(env, "approver_votes"), &votes);

        let mut payments: Map<Symbol, PendingPayment> = env.storage().instance().get(&Symbol::new(env, "payments")).unwrap_or_else(|| Map::new(env));
        let mut payment = payments.get(id.clone()).unwrap_or_else(|| panic!("Payment not found"));
        if payment.executed {
            panic!("Payment already executed");
        }
        payment.approvals += 1;
        let threshold: u32 = env.storage().instance().get(&Symbol::new(env, "threshold")).unwrap_or(1);
        let hv_threshold: i128 = env.storage().instance().get(&Symbol::new(env, "hv_threshold")).unwrap_or(0);

        if payment.amount >= hv_threshold && payment.approvals >= threshold {
            let escrow = env.current_contract_address();
            env.invoke_contract::<()>(&payment.token, &Symbol::new(env, "transfer"), (escrow, payment.recipient.clone(), payment.amount));
            payment.executed = true;
            env.events().publish((Symbol::new(env, "payment_executed"), &payment.proposer), (id.clone(), payment.amount));
        }
        payments.set(id, payment);
        env.storage().instance().set(&Symbol::new(env, "payments"), &payments);
    }

    /// Admin can force-execute low-value payments without multi-sig.
    pub fn execute_payment(&self, env: &Env, id: Symbol) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let hv_threshold: i128 = env.storage().instance().get(&Symbol::new(env, "hv_threshold")).unwrap_or(0);
        let mut payments: Map<Symbol, PendingPayment> = env.storage().instance().get(&Symbol::new(env, "payments")).unwrap_or_else(|| Map::new(env));
        let mut payment = payments.get(id.clone()).unwrap_or_else(|| panic!("Payment not found"));
        if payment.executed {
            panic!("Payment already executed");
        }
        if payment.amount >= hv_threshold {
            panic!("High-value payment requires multi-sig approval");
        }
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&payment.token, &Symbol::new(env, "transfer"), (escrow, payment.recipient.clone(), payment.amount));
        payment.executed = true;
        payments.set(id.clone(), payment.clone());
        env.storage().instance().set(&Symbol::new(env, "payments"), &payments);
        env.events().publish((Symbol::new(env, "payment_executed"), &admin), (id, payment.amount));
    }

    pub fn get_approvals(env: Env, id: Symbol) -> u32 {
        let payments: Map<Symbol, PendingPayment> = env.storage().instance().get(&Symbol::new(&env, "payments")).unwrap_or_else(|| Map::new(&env));
        payments.get(id).map(|p| p.approvals).unwrap_or(0)
    }

    pub fn is_executed(env: Env, id: Symbol) -> bool {
        let payments: Map<Symbol, PendingPayment> = env.storage().instance().get(&Symbol::new(&env, "payments")).unwrap_or_else(|| Map::new(&env));
        payments.get(id).map(|p| p.executed).unwrap_or(false)
    }
}

// ─── Issue #491: HTLC – Hash Time Lock Contract for atomic swaps ───────────────

#[contracttype]
#[derive(Clone)]
pub struct HTLCEntry {
    pub sender: Address,
    pub recipient: Address,
    pub amount: i128,
    pub hashlock: BytesN<32>,
    pub timelock: u64,
    /// 0 = active, 1 = withdrawn, 2 = refunded
    pub status: u32,
}

#[contract]
pub struct HTLCContract;

#[contractimpl]
impl HTLCContract {
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(&Symbol::new(&env, "entries"), &Map::<Symbol, HTLCEntry>::new(&env));
    }

    /// Sender locks funds with a hashlock and timelock.
    pub fn lock(&self, env: &Env, id: Symbol, sender: Address, recipient: Address, amount: i128, hashlock: BytesN<32>, timelock: u64) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        if timelock <= env.ledger().timestamp() {
            panic!("Timelock must be in the future");
        }
        sender.require_auth();
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (sender.clone(), escrow, amount));
        let mut entries: Map<Symbol, HTLCEntry> = env.storage().instance().get(&Symbol::new(env, "entries")).unwrap_or_else(|| Map::new(env));
        if entries.contains_key(id.clone()) {
            panic!("HTLC entry already exists");
        }
        entries.set(id.clone(), HTLCEntry { sender: sender.clone(), recipient, amount, hashlock, timelock, status: 0 });
        env.storage().instance().set(&Symbol::new(env, "entries"), &entries);
        env.events().publish((Symbol::new(env, "htlc_locked"), &sender), (id, amount));
    }

    /// Recipient reveals the preimage to withdraw funds before timelock.
    pub fn withdraw(&self, env: &Env, id: Symbol, preimage: BytesN<32>) {
        let mut entries: Map<Symbol, HTLCEntry> = env.storage().instance().get(&Symbol::new(env, "entries")).unwrap_or_else(|| Map::new(env));
        let mut entry = entries.get(id.clone()).unwrap_or_else(|| panic!("HTLC entry not found"));
        if entry.status != 0 {
            panic!("HTLC already settled");
        }
        if env.ledger().timestamp() >= entry.timelock {
            panic!("Timelock has expired");
        }
        // Verify SHA-256 hash of preimage matches hashlock
        let computed_hash = env.crypto().sha256(&preimage.into());
        if computed_hash != entry.hashlock {
            panic!("Invalid preimage");
        }
        entry.recipient.require_auth();
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (escrow, entry.recipient.clone(), entry.amount));
        entry.status = 1;
        entries.set(id.clone(), entry.clone());
        env.storage().instance().set(&Symbol::new(env, "entries"), &entries);
        env.events().publish((Symbol::new(env, "htlc_withdrawn"), &entry.recipient), id);
    }

    /// Sender reclaims funds after timelock expires.
    pub fn refund(&self, env: &Env, id: Symbol) {
        let mut entries: Map<Symbol, HTLCEntry> = env.storage().instance().get(&Symbol::new(env, "entries")).unwrap_or_else(|| Map::new(env));
        let mut entry = entries.get(id.clone()).unwrap_or_else(|| panic!("HTLC entry not found"));
        if entry.status != 0 {
            panic!("HTLC already settled");
        }
        if env.ledger().timestamp() < entry.timelock {
            panic!("Timelock has not expired yet");
        }
        entry.sender.require_auth();
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (escrow, entry.sender.clone(), entry.amount));
        entry.status = 2;
        entries.set(id.clone(), entry.clone());
        env.storage().instance().set(&Symbol::new(env, "entries"), &entries);
        env.events().publish((Symbol::new(env, "htlc_refunded"), &entry.sender), id);
    }

    /// Returns 0=active, 1=withdrawn, 2=refunded.
    pub fn get_status(env: Env, id: Symbol) -> u32 {
        let entries: Map<Symbol, HTLCEntry> = env.storage().instance().get(&Symbol::new(&env, "entries")).unwrap_or_else(|| Map::new(&env));
        entries.get(id).map(|e| e.status).unwrap_or_else(|| panic!("HTLC not found"))
    }
}

// ─── Issue #492: On-chain refund contract ─────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct RefundRecord {
    pub donor: Address,
    pub amount: i128,
    pub refunded: bool,
}

#[contract]
pub struct RefundContract;

#[contractimpl]
impl RefundContract {
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "token"), &token);
        env.storage().instance().set(&Symbol::new(&env, "records"), &Map::<Symbol, RefundRecord>::new(&env));
    }

    /// Record an accepted payment so it can be refunded on-chain if needed.
    pub fn record_payment(&self, env: &Env, donation_id: Symbol, donor: Address, amount: i128) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut records: Map<Symbol, RefundRecord> = env.storage().instance().get(&Symbol::new(env, "records")).unwrap_or_else(|| Map::new(env));
        if records.contains_key(donation_id.clone()) {
            panic!("Donation already recorded");
        }
        records.set(donation_id, RefundRecord { donor, amount, refunded: false });
        env.storage().instance().set(&Symbol::new(env, "records"), &records);
    }

    /// Admin processes an on-chain refund, transferring funds back to the donor.
    pub fn process_refund(&self, env: &Env, donation_id: Symbol) {
        let admin: Address = env.storage().instance().get(&Symbol::new(env, "admin")).unwrap_or_else(|| panic!("Admin not set"));
        admin.require_auth();
        let mut records: Map<Symbol, RefundRecord> = env.storage().instance().get(&Symbol::new(env, "records")).unwrap_or_else(|| Map::new(env));
        let mut record = records.get(donation_id.clone()).unwrap_or_else(|| panic!("Donation record not found"));
        if record.refunded {
            panic!("Already refunded");
        }
        let token: Address = env.storage().instance().get(&Symbol::new(env, "token")).unwrap();
        let escrow = env.current_contract_address();
        env.invoke_contract::<()>(&token, &Symbol::new(env, "transfer"), (escrow, record.donor.clone(), record.amount));
        record.refunded = true;
        records.set(donation_id.clone(), record.clone());
        env.storage().instance().set(&Symbol::new(env, "records"), &records);
        env.events().publish((Symbol::new(env, "refund_processed"), &admin), (donation_id, record.amount));
    }

    pub fn get_refund_status(env: Env, donation_id: Symbol) -> bool {
        let records: Map<Symbol, RefundRecord> = env.storage().instance().get(&Symbol::new(&env, "records")).unwrap_or_else(|| Map::new(&env));
        records.get(donation_id).map(|r| r.refunded).unwrap_or(false)
    }
}
