//! PTY (Pseudo-Terminal) module for terminal emulation.
//!
//! This module provides cross-platform PTY management for the terminal emulator:
//!
//! - `manager`: Spawning the shell on a PTY
//! - `session`: Per-session handle (writer thread, resize, flow control)
//! - `commands`: Tauri commands exposed to the frontend
//!
//! Each terminal session is identified by a unique UUID and manages its own
//! shell process with bidirectional I/O through the PTY.

pub mod manager;
pub mod session;
pub mod commands;
