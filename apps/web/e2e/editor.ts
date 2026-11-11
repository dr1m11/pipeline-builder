import type { Download, FileChooser, Page } from '@playwright/test';

/** A port of a node on the canvas: the node's name, then the port's ("Output value (text)"). */
export type PortAddress = readonly [node: string, port: string];

/**
 * Locators and actions of the editor page, found the way users and assistive technology find
 * them: by landmark, role and accessible name. Locators wait for nothing; use them in web-first
 * assertions.
 */
export function editor(page: Page) {
  const palette = page.getByRole('complementary', { name: 'Node palette' });
  const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const fileToolbar = page.getByRole('toolbar', { name: 'File' });
  const editToolbar = page.getByRole('toolbar', { name: 'Edit' });
  const runToolbar = page.getByRole('toolbar', { name: 'Run' });
  const notifications = page.getByRole('region', { name: 'Notifications (F8)' });

  // Nodes and edges are both groups, named exactly: a node by its label, an edge after its nodes
  // and ports ("Input 1 value to Prompt 1 question"), followed by its problem if it has one. React
  // Flow renders an edge only once it can draw it to both handles, so an attached edge is a drawn
  // one; a straight edge has no height, which `toBeVisible` would count as hidden.
  const node = (name: string) => canvas.getByRole('group', { name, exact: true });
  const port = (nodeName: string, portName: string) =>
    node(nodeName).getByRole('button', { name: portName });
  const paletteItem = (kind: string) => palette.getByRole('button', { name: `Add ${kind}` });

  return {
    /** The pipeline's name, the page heading. */
    heading: page.getByRole('heading', { level: 1 }),
    palette,
    /** The palette's button that adds a node of `kind` ("LLM Call"). */
    paletteItem,
    canvas,
    /** What an empty canvas says. */
    emptyHint: canvas.getByText(
      'Drag a node from the palette, or click one, to start your pipeline.',
    ),
    /** The templates an empty canvas offers. */
    templateButtons: canvas.getByRole('group', { name: 'Start from a template:' }),
    node,
    edge: node,
    port,
    inspector,
    /**
     * The toggle of the inspector's Problems section, named after the counts ("Problems: 2 errors,
     * 1 warning", "Problems: none").
     */
    problemsSummary: inspector.getByRole('button', { name: /^Problems: / }),
    /** The list of every problem of the pipeline. */
    problems: inspector.getByRole('list', { name: 'Problems of the pipeline' }),
    fileToolbar,
    editToolbar,
    /** Named after the change it undoes ("Undo Paste 2 nodes"), or just "Undo" with none. */
    undoButton: editToolbar.getByRole('button', { name: /^Undo\b/ }),
    /** Named after the change it redoes, or just "Redo" with none. */
    redoButton: editToolbar.getByRole('button', { name: /^Redo\b/ }),
    /**
     * Runs the pipeline. Unavailable buttons stay focusable, so Run and Stop are marked with
     * `aria-disabled`, and Run is described by why it cannot run ("Fix 1 error to run").
     */
    runButton: runToolbar.getByRole('button', { name: 'Run', exact: true }),
    stopButton: runToolbar.getByRole('button', { name: 'Stop', exact: true }),
    /**
     * The run's live region: "Run started", then "Run finished: 4 nodes done", "Run stopped" or
     * "Run failed"; or why the pipeline cannot run.
     */
    runStatus: runToolbar.getByRole('status'),
    /**
     * What a node shows of its run on its card, as a read-only text field: the text an LLM Call
     * streams ("Model response") or the value an Output gets ("Answer result").
     */
    runPreview: (nodeName: string, valueName: 'response' | 'result') =>
      node(nodeName).getByRole('textbox', { name: `${nodeName} ${valueName}`, exact: true }),
    /** The inspector's account of what the run did to the selected node, with its full values. */
    runOutput: inspector.getByRole('region', { name: 'Run output' }),
    apiKeysDialog: page.getByRole('dialog', { name: 'API keys' }),
    shortcutsButton: page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }),
    shortcutsHelp: page.getByRole('dialog', { name: 'Keyboard shortcuts' }),
    /** Every toast on screen. */
    toasts: notifications.getByRole('listitem'),
    /** The toast that says `text`, in its title or description. */
    toast: (text: string) => notifications.getByRole('listitem').filter({ hasText: text }),

    /** Adds a node of `kind` from the palette with the keyboard. */
    addNode: async (kind: string) => {
      await paletteItem(kind).press('Enter');
    },
    /** Connects an output port to an input port by clicking one, then the other. */
    connect: async (from: PortAddress, to: PortAddress) => {
      await port(...from).click();
      await port(...to).click();
    },
    /**
     * Selects a node by clicking its title; with `add`, Ctrl/⌘-clicks it into the selection
     * instead.
     */
    select: async (name: string, { add = false } = {}) => {
      await node(name)
        .getByText(name, { exact: true })
        .click(add ? { modifiers: ['ControlOrMeta'] } : undefined);
    },
    /** Picks `item` ("Blank pipeline", a template's name) in the File toolbar's New menu. */
    chooseFromNewMenu: async (item: string) => {
      await fileToolbar.getByRole('button', { name: 'New' }).click();
      await page.getByRole('menuitem', { name: item }).click();
    },
    /** Imports `files`, picked in the file chooser that the Import button opens. */
    importFile: async (files: Parameters<FileChooser['setFiles']>[0]) => {
      const chooser = page.waitForEvent('filechooser');
      await fileToolbar.getByRole('button', { name: 'Import pipeline' }).click();
      await (await chooser).setFiles(files);
    },
    /** Exports the pipeline with the Export button and returns the download. */
    exportFile: async (): Promise<Download> => {
      const download = page.waitForEvent('download');
      await fileToolbar.getByRole('button', { name: 'Export pipeline' }).click();
      return download;
    },
  };
}
