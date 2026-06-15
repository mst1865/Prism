use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrismConfig {
    vault_dir: String,
    watch_dirs: Vec<String>,
}

impl Default for PrismConfig {
    fn default() -> Self {
        Self {
            vault_dir: "D:\\TolariaVault".to_string(),
            watch_dirs: Vec::new(),
        }
    }
}

#[tauri::command]
fn get_prism_config() -> Result<PrismConfig, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(PrismConfig::default());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_prism_config(config: PrismConfig) -> Result<(), String> {
    let path = config_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "Unable to resolve Prism config directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let content = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn config_path() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA is not set".to_string())?;
    Ok(PathBuf::from(appdata).join("Prism").join("config.json"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_prism_config, save_prism_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
