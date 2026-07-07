#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

#[test]
fn test_register_and_get_project() {
    let env = Env::default();
    let contract_id = env.register_contract(None, ProjectRegistry);
    let client = ProjectRegistryClient::new(&env, &contract_id);
    let owner = Address::generate(&env);

    let project_id = String::from_str(&env, "proj-001");
    let project_name = String::from_str(&env, "My DeFi Protocol");

    let record = client.register_project(&owner, &project_id, &project_name);

    assert_eq!(record.project_name, project_name);
    assert_eq!(record.status, String::from_str(&env, "ACTIVE"));

    let retrieved = client.get_project(&project_id);
    assert!(retrieved.is_some());
}
