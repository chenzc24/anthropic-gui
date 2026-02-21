import React, { useEffect, useState } from 'react';
import { FileText, Folder, RefreshCw, Search } from 'lucide-react';
import { FileNode as IFileNode, fetchFiles } from '../../api/files.api';

interface FileBrowserProps {
  onSelectFile: (file: IFileNode) => void;
  selectedFile?: string;
  className?: string;
  allowedExtensions?: string[];
}

const FileBrowser: React.FC<FileBrowserProps> = ({
  onSelectFile,
  selectedFile,
  className = '',
  allowedExtensions,
}) => {
  const [files, setFiles] = useState<IFileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFiles();
      setFiles(data);
    } catch (err) {
      setError('Failed to load files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const filteredFiles = files.filter((file) => {
    // Filter by search query
    const matchesSearch = file.path.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by extension if provided
    let matchesExtension = true;
    if (allowedExtensions && allowedExtensions.length > 0) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      matchesExtension = ext ? allowedExtensions.includes(ext) : false;
    }

    return matchesSearch && matchesExtension;
  });

  return (
    <div className={`flex flex-col h-full bg-slate-50 border-r border-slate-200 ${className}`}>
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Project Files</h2>
          <button
            onClick={loadFiles}
            className="p-1 hover:bg-slate-100 rounded-full transition-colors"
            title="Refresh files"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-slate-400' : 'text-slate-500'} />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-slate-400 text-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-500 text-sm">
            {error}
            <button 
              onClick={loadFiles}
              className="mt-2 text-xs text-blue-600 hover:underline block mx-auto"
            >
              Retry
            </button>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-sm">
            No matching files found
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filteredFiles.map((file) => {
              const isSelected = selectedFile === file.path;
              return (
                <li key={file.path}>
                  <button
                    onClick={() => onSelectFile(file)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {file.type === 'directory' ? (
                      <Folder size={14} className={isSelected ? 'text-blue-500' : 'text-slate-400'} />
                    ) : (
                      <FileText size={14} className={isSelected ? 'text-blue-500' : 'text-slate-400'} />
                    )}
                    <span className="truncate flex-1" title={file.path}>
                      {file.path}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      
      <div className="p-2 border-t border-slate-200 bg-white text-xs text-slate-400 text-center">
        {files.length} files found
      </div>
    </div>
  );
};

export default FileBrowser;
