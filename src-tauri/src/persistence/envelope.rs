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
        let version = take_number(&mut file, "version")?;
        let revision = take_number(&mut file, "revision")?;
        let data = file.remove("data").unwrap_or(Value::Object(file));
        Ok(Self { version, revision, data })
    }
}

/// A missing key reads as 0; a key that is not a fitting non-negative integer
/// means the file is corrupt, and must not silently become revision 0.
fn take_number<T: TryFrom<u64>>(file: &mut Map<String, Value>, key: &str) -> Result<T, String> {
    let invalid = || format!("\"{}\" is not a valid number", key);
    let number = match file.remove(key) {
        None => 0,
        Some(value) => value.as_u64().ok_or_else(invalid)?,
    };
    T::try_from(number).map_err(|_| invalid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_a_full_envelope() {
        let file = Persisted::from_json(r#"{"version": 2, "revision": 7, "data": [1]}"#).unwrap();
        assert_eq!(file, Persisted { version: 2, revision: 7, data: json!([1]) });
    }

    #[test]
    fn missing_version_and_revision_read_as_zero() {
        let file = Persisted::from_json(r#"{"data": 1}"#).unwrap();
        assert_eq!((file.version, file.revision), (0, 0));
    }

    #[test]
    fn a_revision_that_is_not_a_number_is_corrupt() {
        for revision in [r#""3""#, "-1", "1.5", "null"] {
            let text = format!(r#"{{"version": 1, "revision": {}, "data": 1}}"#, revision);
            assert!(Persisted::from_json(&text).is_err(), "revision {revision}");
        }
    }

    #[test]
    fn a_version_that_does_not_fit_is_corrupt() {
        for version in [r#""1""#, "-1", "4294967296"] {
            let text = format!(r#"{{"version": {}, "revision": 1, "data": 1}}"#, version);
            assert!(Persisted::from_json(&text).is_err(), "version {version}");
        }
    }
}
