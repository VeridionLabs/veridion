#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, Env, String};

fn setup_test() -> (Env, Address, AuditRegistryClient) {
    let env = Env::default();
    let contract_id = env.register_contract(None, AuditRegistry);
    let client = AuditRegistryClient::new(&env, &contract_id);
    let auditor = Address::generate(&env);
    (env, auditor, client)
}

#[test]
fn test_register_and_get_audit() {
    let (env, auditor, client) = setup_test();

    let audit_id = String::from_str(&env, "audit-001");
    let project_id = String::from_str(&env, "proj-001");
    let project_name = String::from_str(&env, "Test DEX");
    let contract_hash = String::from_str(&env, "0xabc123def456");
    let report_hash = String::from_str(&env, "QmReportHash");
    let version = String::from_str(&env, "1.0.0");

    let record = client.register_audit(
        &auditor,
        &audit_id,
        &project_id,
        &project_name,
        &contract_hash,
        &report_hash,
        85u32,
        &version,
    );

    assert_eq!(record.audit_id, audit_id);
    assert_eq!(record.security_score, 85);
    assert_eq!(record.status, String::from_str(&env, "COMPLETED"));

    // Retrieve it
    let retrieved = client.get_audit(&audit_id);
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().report_hash, report_hash);
}

#[test]
fn test_verify_audit() {
    let (env, auditor, client) = setup_test();

    let audit_id = String::from_str(&env, "audit-001");

    // Register first
    client.register_audit(
        &auditor,
        &audit_id,
        &String::from_str(&env, "proj"),
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "hash1"),
        &String::from_str(&env, "hash2"),
        90,
        &String::from_str(&env, "1.0.0"),
    );

    // Verify
    let verified = client.verify_audit(&auditor, &audit_id);
    assert_eq!(verified.status, String::from_str(&env, "VERIFIED"));
}

#[test]
#[should_panic(expected = "Audit already registered")]
fn test_duplicate_audit_panics() {
    let (env, auditor, client) = setup_test();

    let audit_id = String::from_str(&env, "audit-001");

    client.register_audit(
        &auditor, &audit_id,
        &String::from_str(&env, "proj"), &String::from_str(&env, "Test"),
        &String::from_str(&env, "h1"), &String::from_str(&env, "h2"),
        80, &String::from_str(&env, "1.0.0"),
    );

    client.register_audit(
        &auditor, &audit_id,
        &String::from_str(&env, "proj2"), &String::from_str(&env, "Test2"),
        &String::from_str(&env, "h3"), &String::from_str(&env, "h4"),
        80, &String::from_str(&env, "1.0.0"),
    );
}
