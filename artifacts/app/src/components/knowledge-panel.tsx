import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetKnowledge, 
  getGetKnowledgeQueryKey,
  useGetRules,
  useSaveRules,
  useUploadMac
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Upload, Database, FileText, Loader2, Save } from "lucide-react";

export function KnowledgePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Queries
  const { data: knowledge, isLoading: isLoadingKnowledge } = useGetKnowledge();
  const { data: rules, isLoading: isLoadingRules } = useGetRules();
  
  // Mutations
  const saveRulesMutation = useSaveRules({
    mutation: {
      onSuccess: () => {
        toast({ title: "Rules saved successfully", description: "Stipe's rules have been updated." });
        queryClient.invalidateQueries({ queryKey: getGetKnowledgeQueryKey() });
      },
      onError: () => {
        toast({ title: "Error saving rules", variant: "destructive" });
      }
    }
  });

  const uploadMacMutation = useUploadMac({
    mutation: {
      onSuccess: (data: any) => {
        if (data.success) {
          toast({ 
            title: "Upload successful", 
            description: `Uploaded files. Found ${data.stats.formulaCount} formulas.` 
          });
          queryClient.invalidateQueries({ queryKey: getGetKnowledgeQueryKey() });
        } else {
          toast({ title: "Upload failed", description: data.message || "Unknown error", variant: "destructive" });
        }
      },
      onError: (error: any) => {
        toast({ title: "Upload failed", description: error.message || "Unknown error", variant: "destructive" });
      },
      onSettled: () => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  });

  const [rulesContent, setRulesContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync rules content
  useEffect(() => {
    if (rules?.content !== undefined) {
      setRulesContent(rules.content);
    }
  }, [rules]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => {
      formData.append("files", file);
    });

    // Pass FormData via the request parameter override
    uploadMacMutation.mutate({ data: formData as any });
  };


  const handleSaveRules = () => {
    saveRulesMutation.mutate({ data: { content: rulesContent } });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6 space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Knowledge Base</h2>
        <p className="text-sm text-muted-foreground mb-6">Manage MegaTischler formulas and parameters.</p>
        
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium flex items-center text-sm">
              <Database className="w-4 h-4 mr-2 text-primary" />
              Database Stats
            </h3>
          </div>
          
          {isLoadingKnowledge ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Formulas</span>
                <span className="text-lg font-semibold">{knowledge?.stats.formulaCount || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Parameters</span>
                <span className="text-lg font-semibold">{knowledge?.stats.parameterCount || 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3 text-sm flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          Upload .mac Files
        </h3>
        <div className="border border-dashed border-border rounded-md p-6 flex flex-col items-center justify-center text-center bg-muted/30">
          <Upload className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm mb-4 text-muted-foreground">Select parametric files to extract knowledge</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            multiple 
            accept=".mac,.txt"
          />
          <Button 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMacMutation.isPending}
          >
            {uploadMacMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {uploadMacMutation.isPending ? "Uploading..." : "Select Files"}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-[250px]">
        <h3 className="font-medium mb-3 text-sm flex items-center justify-between">
          <span>Stipe's Rules</span>
          <Button size="sm" variant="ghost" onClick={handleSaveRules} disabled={saveRulesMutation.isPending}>
            {saveRulesMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </h3>
        {isLoadingRules ? (
          <Skeleton className="flex-1 w-full rounded-md" />
        ) : (
          <Textarea 
            value={rulesContent}
            onChange={(e) => setRulesContent(e.target.value)}
            className="flex-1 font-mono text-sm resize-none bg-muted/30 focus-visible:ring-1"
            placeholder="Define custom syntax and design rules here..."
          />
        )}
      </div>
    </div>
  );
}
