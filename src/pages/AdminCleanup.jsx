import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { AlertCircle, Trash2 } from "lucide-react";
import { deleteAllMembersExcept } from "@/lib/deleteAllMembersExcept";

export default function AdminCleanup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirmStage, setConfirmStage] = useState(0);
  const phoneToKeep = "+919884576080"; // Vijay's phone

  const handleDeleteAllMembers = async () => {
    if (confirmStage < 2) {
      setConfirmStage(confirmStage + 1);
      return;
    }

    setLoading(true);
    try {
      const result = await deleteAllMembersExcept(phoneToKeep);
      toast({
        title: "✓ Cleanup Complete",
        description: result.message,
      });
      setConfirmStage(0);
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Data Cleanup</h1>
      </div>

      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 space-y-4">
        <div className="flex gap-3">
          <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-red-300 mb-2">Delete All Members Except Vijay</h2>
            <p className="text-sm text-red-300/80">
              This will <strong>permanently delete</strong> all member profiles and their related data (payments, group memberships, dividends, etc.) except for the member with phone +919884576080.
            </p>
            <p className="text-xs text-red-300/60 mt-3">
              This action cannot be undone. All data will be lost.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-red-500/20">
          {confirmStage === 0 && (
            <Button
              onClick={handleDeleteAllMembers}
              className="w-full bg-red-600 hover:bg-red-700 rounded-lg"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All Members (Except Vijay)
            </Button>
          )}

          {confirmStage === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-red-300">
                Are you sure? This will delete all members except Vijay.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setConfirmStage(0)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAllMembers}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  Yes, Delete
                </Button>
              </div>
            </div>
          )}

          {confirmStage === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-red-400">
                ⚠️ This is the final confirmation. Click again to proceed.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => setConfirmStage(0)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAllMembers}
                  disabled={loading}
                  className="flex-1 bg-red-700 hover:bg-red-800"
                >
                  {loading ? "Deleting..." : "Final Confirmation - Delete All"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
