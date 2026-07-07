#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Address, Map};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ProjectRecord {
    pub project_id: String,
    pub project_name: String,
    pub owner: Address,
    pub created_at: u64,
    pub updated_at: u64,
    pub status: String, // "ACTIVE" | "ARCHIVED"
}

#[contract]
pub struct ProjectRegistry;

#[contractimpl]
impl ProjectRegistry {
    /// Register a project on-chain
    pub fn register_project(
        env: Env,
        owner: Address,
        project_id: String,
        project_name: String,
    ) -> ProjectRecord {
        owner.require_auth();

        let storage = env.storage().persistent();
        let timestamp = env.ledger().timestamp();

        let record = ProjectRecord {
            project_id: project_id.clone(),
            project_name: project_name.clone(),
            owner: owner.clone(),
            created_at: timestamp,
            updated_at: timestamp,
            status: String::from_str(&env, "ACTIVE"),
        };

        let key = symbol_short!("p");
        let mut projects: Map<String, ProjectRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));
        projects.set(project_id.clone(), record.clone());
        storage.set(&key, &projects);

        env.events().publish(
            (symbol_short!("proj_reg"), project_id),
            record.clone(),
        );

        record
    }

    /// Get a project by ID
    pub fn get_project(env: Env, project_id: String) -> Option<ProjectRecord> {
        let storage = env.storage().persistent();
        let key = symbol_short!("p");
        let projects: Map<String, ProjectRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));
        projects.get(project_id)
    }

    /// Update project status
    pub fn update_status(
        env: Env,
        owner: Address,
        project_id: String,
        new_status: String,
    ) -> ProjectRecord {
        owner.require_auth();

        let storage = env.storage().persistent();
        let key = symbol_short!("p");
        let mut projects: Map<String, ProjectRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        let mut record = projects.get(project_id.clone())
            .expect("Project not found");

        if record.owner != owner {
            panic!("Only the owner can update project status");
        }

        record.status = new_status;
        record.updated_at = env.ledger().timestamp();
        projects.set(project_id.clone(), record.clone());
        storage.set(&key, &projects);

        record
    }

    /// Get all projects for an owner
    pub fn get_projects_by_owner(env: Env, owner: Address) -> Vec<ProjectRecord> {
        let storage = env.storage().persistent();
        let key = symbol_short!("p");
        let projects: Map<String, ProjectRecord> = storage
            .get(&key)
            .unwrap_or_else(|| Map::new(&env));

        projects.values()
            .filter(|r| r.owner == owner)
            .collect()
    }

    pub fn version() -> String {
        String::from_str(&soroban_sdk::Env::default(), "1.0.0")
    }
}

#[cfg(test)]
mod test;
