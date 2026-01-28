//! PTY (Pseudo-Terminal) module for terminal emulation.
//!
//! This module provides cross-platform PTY management for the terminal emulator:
//!
//! - `manager`: Core PTY operations (spawn, write, resize)
//! - `commands`: Tauri commands exposed to the frontend
//!
//! Each terminal session is identified by a unique UUID and manages its own
//! shell process with bidirectional I/O through the PTY.

pub mod manager;
pub mod commands;
