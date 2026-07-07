#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Symbol, Address, Map, Vec};

/// Audit record stored on-chain
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AuditRecord {
    pub audit_id: String,
    pub project_id: String,
    pub project_name: String,
    pub contract_hash: String,
    pub report_hash: String,
    pub security_score: u32,
    pub timestamp: u64,
    pub version: String,
    pub auditor: Address,
    pub status: String, // "COMPLETED" | "VERIFIED"
}

/// The audit registry contract
#[contract]
pub struct AuditRegistry;

#[contractimpl]
impl AuditRegistry {
    /// Register a new audit on-chain
    pub fn register_audit(
        env: Env,
        auditor: Address,
        audit_id: String,
        project_id: String,
        project_name: String,
        contract_hash: String,
        report_hash: String,
        security_score: u32,
        version: String,
    ) -> AuditRecord {
        // Require auditor authorization
        auditor.require_auth();

        let storage = env.storage().persistent();

        // Check for duplicate audit
        let audit_key = symbol_short!("a");
        let mut audits: Map<String, String> = storage
            .get(&audit_key)
            .unwrap_or_else(|| Map::new(&env));

        if audits.contains_key(audit_id.clone()) {
            panic!("Audit already registered");
        }

        let record = AuditRecord {
            audit_id: audit_id.clone(),
            project_id: project_id.clone(),
            project_name: project_name.clone(),
            contract_hash: contract_hash.clone(),
            report_hash: report_hash.clone(),
            security_score,
            timestamp: env.ledger().timestamp(),
            version: version.clone(),
            auditor: auditor.clone(),
            status: String::from_str(&env, "COMPLETED"),
        };

        // Store record
        let record_key = symbol_short!("r");
        let mut records: Map<String, AuditRecord> = storage
            .get(&record_key)
            .unwrap_or_else(|| Map::new(&env));
        records.set(audit_id.clone(), record.clone());
        storage.set(&record_key, &records);

        // Index by project
        let project_key = symbol_short!("p");
        let mut project_audits: Map<String, Vec<String>> = storage
            .get(&project_key)
            .unwrap_or_else(|| Map::new(&env));
        let mut audit_list = project_audits
            .get(project_id.clone())
            .unwrap_or_else(|| Vec::new(&env));
        audit_list.push_back(audit_id.clone());
        project_audits.set(project_id, audit_list);
        storage.set(&project_key, &project_audits);

        // Emit event
        env.events().publish(
            (symbol_short!("audit_reg"), audit_id.clone()),
            record.clone(),
        );

        record
    }

    /// Get an audit by ID
    pub fn get_audit(env: Env, audit_id: String) -> Option<AuditRecord> {
        let storage = env.storage().persistent();
        let record_key = symbol_short!("r");
        let records: Map<String, AuditRecord> = storage.get(&record_key).unwrap_or_else(|| Map::new(&env));
        records.get(audit_id)
    }

    /// Get all audits for a project
    pub fn get_project_audits(env: Env, project_id: String) -> Vec<String> {
        let storage = env.storage().persistent();
        let project_key = symbol_short!("p");
        let project_audits: Map<String, Vec<String>> = storage
            .get(&project_key)
            .unwrap_or_else(|| Map::new(&env));
        project_audits.get(project_id).unwrap_or_else(|| Vec::new(&env))
    }

    /// Verify an audit (set status to VERIFIED)
    pub fn verify_audit(env: Env, auditor: Address, audit_id: String) -> AuditRecord {
        auditor.require_auth();

        let storage = env.storage().persistent();
        let record_key = symbol_short!("r");
        let mut records: Map<String, AuditRecord> = storage
            .get(&record_key)
            .unwrap_or_else(|| Map::new(&env));

        let mut record = records.get(audit_id.clone())
            .expect("Audit not found");

        if record.status != String::from_str(&env, "COMPLETED") {
            panic!("Audit already verified or invalid status");
        }

        record.status = String::from_str(&env, "VERIFIED");
        records.set(audit_id.clone(), record.clone());
        storage.set(&record_key, &records);

        env.events().publish(
            (symbol_short!("audit_ver"), audit_id),
            record.clone(),
        );

        record
    }

    /// Get total audit count
    pub fn get_audit_count(env: Env) -> u32 {
        let storage = env.storage().persistent();
        let record_key = symbol_short!("r");
        let records: Map<String, AuditRecord> = storage
            .get(&record_key)
            .unwrap_or_else(|| Map::new(&env));
        records.len()
    }

    /// Get the contract version
    pub fn version() -> String {
        String::from_str(
            &soroban_sdk::Env::default(),
            "1.0.0",
        )
    }
}

#[cfg(test)]
mod test;
