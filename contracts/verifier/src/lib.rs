#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Address, BytesN, Map, Vec};

/// Verification status states
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VerificationStatus {
    Pending,
    Verified,
    Flagged,
    Revoked,
}

/// Verification record on-chain with multi-party attestation
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VerificationRecord {
    pub audit_id: String,
    pub target_contract: Address,
    pub report_hash: String,
    pub status: VerificationStatus,
    pub security_score: u32,
    pub signatures: Vec<Address>,
    pub threshold: u32,
    pub verified_at: u64,
    pub updated_at: u64,
}

/// Security score metrics for on-chain query
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SecurityScore {
    pub overall_score: u32,
    pub critical_count: u32,
    pub high_count: u32,
    pub medium_count: u32,
    pub low_count: u32,
    pub last_updated: u64,
}

/// Soulbound security badge metadata
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SecurityBadge {
    pub contract_address: Address,
    pub badge_level: String,  // "GOLD", "SILVER", "BRONZE", "NONE"
    pub security_score: u32,
    pub issued_at: u64,
    pub valid_until: u64,
    pub issuer: Address,
}

#[contract]
pub struct Verifier;

#[contractimpl]
impl Verifier {
    /// Initialize authorized auditors and threshold configuration
    pub fn init(env: Env, admin: Address, auditors: Vec<Address>, threshold: u32) {
        admin.require_auth();
        
        let storage = env.storage().persistent();
        
        // Store admin
        let admin_key = symbol_short!("admin");
        storage.set(&admin_key, &admin);
        
        // Store authorized auditors
        let auditors_key = symbol_short!("auditors");
        storage.set(&auditors_key, &auditors);
        
        // Store threshold
        let threshold_key = symbol_short!("threshold");
        storage.set(&threshold_key, &threshold);
    }

    /// Submit a verification for an audit with multi-party attestation
    pub fn submit_verification(
        env: Env,
        verifier: Address,
        audit_id: String,
        target_contract: Address,
        report_hash: String,
        security_score: u32,
    ) -> VerificationRecord {
        verifier.require_auth();

        let storage = env.storage().persistent();
        let timestamp = env.ledger().timestamp();

        // Check if verifier is authorized
        let auditors_key = symbol_short!("auditors");
        let auditors: Vec<Address> = storage
            .get(&auditors_key)
            .unwrap_or_else(|| Vec::new(&env));
        
        let is_authorized = auditors.iter().any(|a| a == &verifier);
        if !is_authorized {
            panic!("Verifier is not authorized");
        }

        // Get threshold
        let threshold_key = symbol_short!("threshold");
        let threshold: u32 = storage.get(&threshold_key).unwrap_or(1);

        // Check if verification already exists
        let key = symbol_short!("v");
        let mut verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        let record = if let Some(existing) = verifications.get(audit_id.clone()) {
            // Add signature if not already signed
            let mut signatures = existing.signatures;
            if !signatures.iter().any(|s| s == &verifier) {
                signatures.push_back(verifier.clone());
            }

            // Check if threshold is met
            let status = if signatures.len() >= threshold as u32 {
                VerificationStatus::Verified
            } else {
                VerificationStatus::Pending
            };

            VerificationRecord {
                audit_id: audit_id.clone(),
                target_contract: existing.target_contract,
                report_hash: existing.report_hash,
                status,
                security_score,
                signatures,
                threshold: existing.threshold,
                verified_at: existing.verified_at,
                updated_at: timestamp,
            }
        } else {
            // Create new verification with single signature
            let mut signatures = Vec::new(&env);
            signatures.push_back(verifier.clone());

            VerificationRecord {
                audit_id: audit_id.clone(),
                target_contract,
                report_hash,
                status: VerificationStatus::Pending,
                security_score,
                signatures,
                threshold,
                verified_at: timestamp,
                updated_at: timestamp,
            }
        };

        verifications.set(audit_id.clone(), record.clone());
        storage.set(&key, &verifications);

        // Publish event
        env.events().publish(
            (symbol_short!("verification"), audit_id.clone()),
            record.clone(),
        );

        record
    }

    /// Flag a verification due to post-audit vulnerabilities
    pub fn flag_verification(
        env: Env,
        admin: Address,
        audit_id: String,
        reason: String,
    ) -> VerificationRecord {
        admin.require_auth();

        let storage = env.storage().persistent();
        let admin_key = symbol_short!("admin");
        let stored_admin: Address = storage.get(&admin_key).expect("Admin not set");
        
        if admin != stored_admin {
            panic!("Only admin can flag verifications");
        }

        let key = symbol_short!("v");
        let mut verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        let mut record = verifications.get(audit_id.clone())
            .expect("Verification not found");

        record.status = VerificationStatus::Flagged;
        record.updated_at = env.ledger().timestamp();
        
        verifications.set(audit_id.clone(), record.clone());
        storage.set(&key, &verifications);

        env.events().publish(
            (symbol_short!("flagged"), audit_id.clone()),
            reason,
        );

        record
    }

    /// Revoke a verification (downgrade badge)
    pub fn revoke_verification(
        env: Env,
        admin: Address,
        audit_id: String,
    ) -> VerificationRecord {
        admin.require_auth();

        let storage = env.storage().persistent();
        let admin_key = symbol_short!("admin");
        let stored_admin: Address = storage.get(&admin_key).expect("Admin not set");
        
        if admin != stored_admin {
            panic!("Only admin can revoke verifications");
        }

        let key = symbol_short!("v");
        let mut verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        let mut record = verifications.get(audit_id.clone())
            .expect("Verification not found");

        record.status = VerificationStatus::Revoked;
        record.updated_at = env.ledger().timestamp();
        
        verifications.set(audit_id.clone(), record.clone());
        storage.set(&key, &verifications);

        env.events().publish(
            (symbol_short!("revoked"), audit_id.clone()),
            record.clone(),
        );

        record
    }

    /// On-chain query interface for security status
    pub fn check_security_status(env: Env, target: Address) -> SecurityScore {
        let storage = env.storage().persistent();
        let key = symbol_short!("v");
        let verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        // Find the most recent verification for this target
        let mut latest_record: Option<VerificationRecord> = None;
        let mut latest_timestamp: u64 = 0;

        for (_, record) in verifications.iter() {
            if record.target_contract == target && record.updated_at > latest_timestamp {
                latest_timestamp = record.updated_at;
                latest_record = Some(record);
            }
        }

        match latest_record {
            Some(record) => SecurityScore {
                overall_score: record.security_score,
                critical_count: if record.security_score < 50 { 1 } else { 0 },
                high_count: if record.security_score >= 50 && record.security_score < 70 { 1 } else { 0 },
                medium_count: if record.security_score >= 70 && record.security_score < 85 { 1 } else { 0 },
                low_count: if record.security_score >= 85 { 1 } else { 0 },
                last_updated: record.updated_at,
            },
            None => SecurityScore {
                overall_score: 0,
                critical_count: 0,
                high_count: 0,
                medium_count: 0,
                low_count: 0,
                last_updated: 0,
            },
        }
    }

    /// Issue or update soulbound security badge
    pub fn issue_badge(
        env: Env,
        admin: Address,
        contract_address: Address,
        audit_id: String,
    ) -> SecurityBadge {
        admin.require_auth();

        let storage = env.storage().persistent();
        let admin_key = symbol_short!("admin");
        let stored_admin: Address = storage.get(&admin_key).expect("Admin not set");
        
        if admin != stored_admin {
            panic!("Only admin can issue badges");
        }

        // Get verification record
        let key = symbol_short!("v");
        let verifications: Map<String, VerificationRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        let record = verifications.get(audit_id.clone())
            .expect("Verification not found");

        // Determine badge level based on security score and status
        let badge_level = match (record.status, record.security_score) {
            (VerificationStatus::Verified, score) if score >= 90 => String::from_str(&env, "GOLD"),
            (VerificationStatus::Verified, score) if score >= 75 => String::from_str(&env, "SILVER"),
            (VerificationStatus::Verified, score) if score >= 60 => String::from_str(&env, "BRONZE"),
            (VerificationStatus::Flagged, _) => String::from_str(&env, "FLAGGED"),
            (VerificationStatus::Revoked, _) => String::from_str(&env, "REVOKED"),
            _ => String::from_str(&env, "NONE"),
        };

        let timestamp = env.ledger().timestamp();
        let valid_until = timestamp + 31536000; // 1 year validity

        let badge = SecurityBadge {
            contract_address,
            badge_level,
            security_score: record.security_score,
            issued_at: timestamp,
            valid_until,
            issuer: admin.clone(),
        };

        // Store badge
        let badge_key = symbol_short!("badge");
        let mut badges: Map<Address, SecurityBadge> = storage
            .get(&badge_key)
            .unwrap_or_else(|| Map::new(&env));
        badges.set(contract_address, badge.clone());
        storage.set(&badge_key, &badges);

        // Publish badge event
        env.events().publish(
            (symbol_short!("badge_issued"), contract_address),
            badge.clone(),
        );

        badge
    }

    /// Get badge for a contract
    pub fn get_badge(env: Env, contract_address: Address) -> Option<SecurityBadge> {
        let storage = env.storage().persistent();
        let badge_key = symbol_short!("badge");
        let badges: Map<Address, SecurityBadge> = storage
            .get(&badge_key)
            .unwrap_or_else(|| Map::new(&env));
        badges.get(contract_address)
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
            .map(|r| r.status == VerificationStatus::Verified)
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

    /// Verify data integrity using a hash comparison
    pub fn verify_hash(
        env: Env,
        provided_hash: BytesN<32>,
        expected_hash: BytesN<32>,
    ) -> bool {
        provided_hash == expected_hash
    }

    pub fn version() -> String {
        String::from_str(&soroban_sdk::Env::default(), "2.0.0")
    }
}

#[cfg(test)]
mod test;
