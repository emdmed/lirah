import { useState, useEffect } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { themes, loadTheme } from "./themes/themes";
import { invoke } from "@tauri-apps/api/core";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Folder } from "lucide-react";

function App() {
  const currentTheme = loadTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [folders, setFolders] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [terminalSessionId, setTerminalSessionId] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        setSidebarOpen((prev) => !prev);
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Fetch folders when sidebar opens
  useEffect(() => {
    if (sidebarOpen) {
      loadFolders();
    }
  }, [sidebarOpen]);

  const loadFolders = async (path) => {
    try {
      console.log('Loading folders from path:', path || 'terminal working directory');
      const directories = await invoke('read_directory', { path });
      console.log('Received directories:', directories);
      setFolders(directories);

      if (!path && terminalSessionId) {
        const current = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
        console.log('Terminal working directory:', current);
        setCurrentPath(current);
      } else {
        setCurrentPath(path);
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Layout
        sidebar={
          sidebarOpen && (
            <Sidebar collapsible="none">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>
                    Folders
                    {currentPath && (
                      <div style={{ fontSize: '0.75rem', fontWeight: 'normal', marginTop: '0.25rem', opacity: 0.7 }}>
                        {currentPath}
                      </div>
                    )}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {folders.length === 0 ? (
                        <div style={{ padding: '0.5rem', opacity: 0.5, fontSize: '0.875rem' }}>
                          No folders found
                        </div>
                      ) : (
                        folders.map((folder) => (
                          <SidebarMenuItem key={folder.path}>
                            <SidebarMenuButton onClick={() => loadFolders(folder.path)}>
                              <Folder className="w-4 h-4 mr-2" />
                              {folder.name}
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
          )
        }
      >
        <Terminal
          theme={themes[currentTheme]}
          onSessionReady={(id) => setTerminalSessionId(id)}
        />
      </Layout>
    </SidebarProvider>
  );
}

export default App;
