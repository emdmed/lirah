use rustpython_parser::{parse, Mode};
use rustpython_parser::ast::{self, Stmt, Expr, Mod};
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct PythonSkeleton {
    pub imports: Vec<PythonImport>,
    pub functions: Vec<PythonFunction>,
    pub classes: Vec<PythonClass>,
    pub constants: usize,
}

#[derive(Serialize, Debug)]
pub struct PythonImport {
    pub module: String,
    pub names: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct PythonFunction {
    pub name: String,
    pub line: usize,
    pub decorators: Vec<String>,
    pub params: String,
}

#[derive(Serialize, Debug)]
pub struct PythonClass {
    pub name: String,
    pub line: usize,
    pub decorators: Vec<String>,
    pub bases: Vec<String>,
}

/// Convert byte offset to line number (1-indexed)
fn offset_to_line(content: &str, offset: usize) -> usize {
    content[..offset.min(content.len())]
        .chars()
        .filter(|&c| c == '\n')
        .count() + 1
}

/// Extract decorator name from a decorator expression
fn extract_decorator_name<R>(decorator: &Expr<R>) -> String {
    match decorator {
        Expr::Name(name) => name.id.to_string(),
        Expr::Call(call) => {
            match call.func.as_ref() {
                Expr::Name(name) => name.id.to_string(),
                Expr::Attribute(attr) => attr.attr.to_string(),
                _ => "unknown".to_string(),
            }
        }
        Expr::Attribute(attr) => attr.attr.to_string(),
        _ => "unknown".to_string(),
    }
}

/// Extract parameters from function arguments
fn extract_params<R>(args: &ast::Arguments<R>) -> String {
    let mut params = Vec::new();

    // Position-only args
    for arg in &args.posonlyargs {
        params.push(arg.def.arg.to_string());
    }

    // Regular args
    for arg in &args.args {
        params.push(arg.def.arg.to_string());
    }

    // *args
    if let Some(vararg) = &args.vararg {
        params.push(format!("*{}", vararg.arg));
    }

    // Keyword-only args
    for arg in &args.kwonlyargs {
        params.push(arg.def.arg.to_string());
    }

    // **kwargs
    if let Some(kwarg) = &args.kwarg {
        params.push(format!("**{}", kwarg.arg));
    }

    params.join(", ")
}

/// Extract base class names from a class definition
fn extract_bases<R>(bases: &[Expr<R>]) -> Vec<String> {
    bases.iter().filter_map(|base| {
        match base {
            Expr::Name(name) => Some(name.id.to_string()),
            Expr::Attribute(attr) => Some(attr.attr.to_string()),
            _ => None,
        }
    }).collect()
}

#[tauri::command]
pub fn parse_python_skeleton(content: String, file_path: String) -> Result<PythonSkeleton, String> {
    let parsed = parse(&content, Mode::Module, &file_path)
        .map_err(|e| format!("Parse error: {}", e))?;

    let mut skeleton = PythonSkeleton {
        imports: Vec::new(),
        functions: Vec::new(),
        classes: Vec::new(),
        constants: 0,
    };

    // Extract module body from parsed result
    let body = match parsed {
        Mod::Module(module) => module.body,
        _ => return Err("Expected module".to_string()),
    };

    for stmt in body {
        match stmt {
            // import x, y, z
            Stmt::Import(import_stmt) => {
                for alias in &import_stmt.names {
                    skeleton.imports.push(PythonImport {
                        module: alias.name.to_string(),
                        names: vec![],
                    });
                }
            }

            // from x import a, b, c
            Stmt::ImportFrom(import_from) => {
                let module_name = import_from.module
                    .as_ref()
                    .map(|m| m.to_string())
                    .unwrap_or_else(|| ".".to_string());
                let names: Vec<String> = import_from.names
                    .iter()
                    .map(|alias| alias.name.to_string())
                    .collect();
                skeleton.imports.push(PythonImport {
                    module: module_name,
                    names,
                });
            }

            // def function_name(...):
            Stmt::FunctionDef(func_def) => {
                let decorators: Vec<String> = func_def.decorator_list
                    .iter()
                    .map(|d| extract_decorator_name(d))
                    .collect();

                let offset: usize = func_def.range.start().into();
                skeleton.functions.push(PythonFunction {
                    name: func_def.name.to_string(),
                    line: offset_to_line(&content, offset),
                    decorators,
                    params: extract_params(&func_def.args),
                });
            }

            // async def function_name(...):
            Stmt::AsyncFunctionDef(func_def) => {
                let decorators: Vec<String> = func_def.decorator_list
                    .iter()
                    .map(|d| extract_decorator_name(d))
                    .collect();

                let offset: usize = func_def.range.start().into();
                skeleton.functions.push(PythonFunction {
                    name: func_def.name.to_string(),
                    line: offset_to_line(&content, offset),
                    decorators,
                    params: extract_params(&func_def.args),
                });
            }

            // class ClassName(...):
            Stmt::ClassDef(class_def) => {
                let decorators: Vec<String> = class_def.decorator_list
                    .iter()
                    .map(|d| extract_decorator_name(d))
                    .collect();

                let offset: usize = class_def.range.start().into();
                skeleton.classes.push(PythonClass {
                    name: class_def.name.to_string(),
                    line: offset_to_line(&content, offset),
                    decorators,
                    bases: extract_bases(&class_def.bases),
                });
            }

            // Assignment at module level (constants)
            Stmt::Assign(_) | Stmt::AnnAssign(_) => {
                skeleton.constants += 1;
            }

            _ => {}
        }
    }

    Ok(skeleton)
}
