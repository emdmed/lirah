use serde::Serialize;
use serde_json::{Map, Value};

/// What a persisted file holds on disk: `{ "version", "revision", "data" }`.
/// `version` is the schema, `revision` goes up on every write.
#[derive(Serialize, Debug, PartialEq)]
pub struct Persisted {
    pub version: u32,
    pub revision: u64,
    pub data: Value,
}

impl Persisted {
    /// Files written before this layer (tasks, plans) have no `revision` and
    /// no `data`: they read as revision 0 and their other keys are the data.
    pub fn from_json(text: &str) -> Result<Self, String> {
        let Value::Object(mut file) = serde_json::from_str(text).map_err(|e| e.to_string())? else {
            return Err("not a JSON object".to_string());
        };
        let version = take_number(&mut file, "version").unwrap_or(0) as u32;
        let revision = take_number(&mut file, "revision").unwrap_or(0);
        let data = file.remove("data").unwrap_or(Value::Object(file));
        Ok(Self { version, revision, data })
    }
}

fn take_number(file: &mut Map<String, Value>, key: &str) -> Option<u64> {
    file.remove(key)?.as_u64()
}
