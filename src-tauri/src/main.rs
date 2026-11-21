#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::generate_handler;

/**
 * Verify a fingerprint scanned on the USB fingerprint reader against the
 * enrolled template, and unlock the desk when it matches.
 *
 * This build does not wire a reader SDK in: replace this stub with a call
 * into your reader's Windows desktop SDK (or its native-host bridge) here.
 * Until it is wired, the command fails with a setup message and the unlock
 * code configured in Data & settings -> Desk lock is the way in.
 */
#[tauri::command]
async fn verify_fingerprint() -> Result<(), String> {
    Err(
        "Fingerprint verification is not configured on this device. \
         Set up an unlock code in Data & settings, or wire your USB fingerprint \
         reader's SDK into src-tauri/src/main.rs."
            .to_string(),
    )
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(generate_handler![verify_fingerprint])
        .run(tauri::generate_context!())
        .expect("error while running ultralead+");
}
