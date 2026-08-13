'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { DiffEditor, Editor, Monaco } from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, Download } from 'lucide-react';

interface MonacoDiffViewerProps {
  originalCode: string;
  modifiedCode: string;
  language?: string;
  fileName?: string;
  onAccept?: () => void;
  onReject?: () => void;
  readOnly?: boolean;
}

export function MonacoDiffViewer({
  originalCode,
  modifiedCode,
  language = 'typescript',
  fileName = 'code.ts',
  onAccept,
  onReject,
  readOnly = false,
}: MonacoDiffViewerProps) {
  const [isModified, setIsModified] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    // Configure Monaco editor
    monaco.editor.defineTheme('veridion-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' },
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'string', foreground: 'CE9178' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#2a2a2a',
        'editorCursor.foreground': '#aeafad',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
      },
    });
    monaco.editor.setTheme('veridion-dark');
  };

  const handleEditorChange = (value: string | undefined) => {
    setIsModified(value !== originalCode);
  };

  const handleDownload = () => {
    const blob = new Blob([modifiedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            Code Diff Viewer - {fileName}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDiff(!showDiff)}
            >
              {showDiff ? 'Show Side-by-Side' : 'Show Diff'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          {showDiff ? (
            <DiffEditor
              height="500px"
              language={language}
              original={originalCode}
              modified={modifiedCode}
              theme="veridion-dark"
              options={{
                readOnly,
                renderSideBySide: true,
                ignoreTrimWhitespace: false,
                renderWhitespace: 'selection',
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="bg-muted px-4 py-2 text-sm font-medium border-b">
                  Original
                </div>
                <Editor
                  height="500px"
                  language={language}
                  value={originalCode}
                  theme="veridion-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </div>
              <div>
                <div className="bg-muted px-4 py-2 text-sm font-medium border-b">
                  Modified
                </div>
                <Editor
                  height="500px"
                  language={language}
                  value={modifiedCode}
                  theme="veridion-dark"
                  onChange={handleEditorChange}
                  options={{
                    readOnly,
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex gap-3 mt-4 justify-end">
            <Button
              variant="outline"
              onClick={onReject}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Reject Changes
            </Button>
            <Button
              onClick={onAccept}
              className="flex items-center gap-2"
              disabled={!isModified}
            >
              <Check className="h-4 w-4" />
              Accept Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
