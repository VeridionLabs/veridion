#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Address, BytesN, Map};

/// Verification record on-chain
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VerificationRecord {
    pub audit_id: String,
    pub verifier: Address,
    pub report_hash: String,
    pub verified_at: u64,
    pub is_valid: bool,
}

#[contract]
pub struct Verifier;

#[contractimpl]
impl Verifier {
    /// Submit a verification for an audit
    pub fn verify(
        env: Env,
        verifier: Address,
        audit_id: String,
        report_hash: String,
    ) -> VerificationRecord {
        verifier.require_auth();

        let storage = env.storage().persistent();
        let timestamp = env.ledger().timestamp();

        let record = VerificationRecord {
            audit_id: audit_id.clone(),
            verifier: verifier.clone(),
            report_hash: report_hash.clone(),
            verified_at: timestamp,
            is_valid: true,
        };

        let key = symbol_short!("v");
        let mut verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));
        verifications.set(audit_id.clone(), record.clone());
        storage.set(&key, &verifications);

        env.events().publish(
            (symbol_short!("verified"), audit_id.clone()),
            record.clone(),
        );

        record
    }

    /// Check if an audit has been verified
    pub fn is_verified(env: Env, audit_id: String) -> bool {
        let storage = env.storage().persistent();
        let key = symbol_short!("v");
        let verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        verifications
            .get(audit_id)
            .map(|r| r.is_valid)
            .unwrap_or(false)
    }

    /// Get verification record for an audit
    pub fn get_verification(env: Env, audit_id: String) -> Option<VerificationRecord> {
        let storage = env.storage().persistent();
        let key = symbol_short!("v");
        let verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));
        verifications.get(audit_id)
    }

    /// Revoke a verification
    pub fn revoke(env: Env, verifier: Address, audit_id: String) -> VerificationRecord {
        verifier.require_auth();

        let storage = env.storage().persistent();
        let key = symbol_short!("v");
        let mut verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        let mut record = verifications.get(audit_id.clone())
            .expect("Verification not found");

        if record.verifier != verifier {
            panic!("Only the original verifier can revoke");
        }

        record.is_valid = false;
        verifications.set(audit_id, record.clone());
        storage.set(&key, &verifications);

        record
    }

    /// Verify data integrity using a hash comparison
    pub fn verify_hash(
        env: Env,
        provided_hash: BytesN<32>,
        expected_hash: BytesN<32>,
    ) -> bool {
        provided_hash == expected_hash
    }

    pub fn version() -> String {
        String::from_str(&soroban_sdk::Env::default(), "1.0.0")
    }
}

#[cfg(test)]
mod test;
