import { useState } from "react";

export function useDialogs() {
  const [addBookmarkDialogOpen, setAddBookmarkDialogOpen] = useState(false);
  const [bookmarksPaletteOpen, setBookmarksPaletteOpen] = useState(false);
  const [initialProjectDialogOpen, setInitialProjectDialogOpen] = useState(false);
  const [manageTemplatesDialogOpen, setManageTemplatesDialogOpen] = useState(false);
  const [saveFileGroupDialogOpen, setSaveFileGroupDialogOpen] = useState(false);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffFilePath, setDiffFilePath] = useState(null);
  const [cliSelectionModalOpen, setCliSelectionModalOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return {
    addBookmarkDialogOpen, setAddBookmarkDialogOpen,
    bookmarksPaletteOpen, setBookmarksPaletteOpen,
    initialProjectDialogOpen, setInitialProjectDialogOpen,
    manageTemplatesDialogOpen, setManageTemplatesDialogOpen,
    saveFileGroupDialogOpen, setSaveFileGroupDialogOpen,
    diffDialogOpen, setDiffDialogOpen,
    diffFilePath, setDiffFilePath,
    cliSelectionModalOpen, setCliSelectionModalOpen,
    showHelp, setShowHelp,
  };
}
