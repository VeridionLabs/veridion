#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

#[test]
fn test_verify_and_check() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Verifier);
    let client = VerifierClient::new(&env, &contract_id);
    let verifier = Address::generate(&env);

    let audit_id = String::from_str(&env, "audit-001");
    let report_hash = String::from_str(&env, "QmReportHash123");

    // Verify
    let record = client.verify(&verifier, &audit_id, &report_hash);
    assert!(record.is_valid);

    // Check verification
    assert!(client.is_verified(&audit_id));

    // Revoke
    let revoked = client.revoke(&verifier, &audit_id);
    assert!(!revoked.is_valid);
    assert!(!client.is_verified(&audit_id));
}
