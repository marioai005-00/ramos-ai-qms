import os
import shutil
import sys
import subprocess
import json

def get_project_root():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def restore_from_git(project_root):
    print("\n[Mode 1] Restoring from Git Checkpoint Branch / Tag...")
    try:
        res = subprocess.run(["git", "status"], cwd=project_root, capture_output=True, text=True)
        if res.returncode != 0:
            print("❌ Git is not available in this environment.")
            return False

        print("1. Discarding uncommitted working tree changes...")
        subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=project_root, check=True)
        subprocess.run(["git", "clean", "-fd"], cwd=project_root, check=True)

        print("2. Checking out tag: v1.0.0-gold-checkpoint...")
        subprocess.run(["git", "checkout", "v1.0.0-gold-checkpoint"], cwd=project_root, check=True)

        print("✅ Successfully restored to Git Checkpoint (v1.0.0-gold-checkpoint)!")
        return True
    except Exception as e:
        print(f"❌ Git restore failed: {e}")
        return False

def restore_from_physical_backup(project_root):
    print("\n[Mode 2] Restoring from Physical Snapshot Directory...")
    backup_dir = os.path.join(project_root, "backups", "checkpoint_20260909_gold_baseline")
    if not os.path.exists(backup_dir):
        print(f"❌ Backup directory not found: {backup_dir}")
        return False

    manifest_file = os.path.join(backup_dir, "CHECKPOINT_MANIFEST.json")
    if os.path.exists(manifest_file):
        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest = json.load(f)
            print(f"Loaded Manifest: {manifest.get('checkpoint_name')} ({manifest.get('timestamp')})")

    for item in os.listdir(backup_dir):
        if item == "CHECKPOINT_MANIFEST.json":
            continue
        src = os.path.join(backup_dir, item)
        dst = os.path.join(project_root, item)
        if os.path.isdir(src):
            if os.path.exists(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            print(f"Restored directory: {item}/")
        elif os.path.isfile(src):
            shutil.copy2(src, dst)
            print(f"Restored file: {item}")

    print("✅ Successfully restored all files from physical snapshot backup!")
    return True

def main():
    project_root = get_project_root()
    print("=" * 65)
    print(" 🔄 RAMOS AI-QMS 8D — 1-CLICK INSTANT CHECKPOINT RESTORE ENGINE")
    print(" Checkpoint: Phase 1 Gold Baseline (v1.0.0-gold-checkpoint)")
    print("=" * 65)
    print(f"Project Directory: {project_root}\n")

    if len(sys.argv) > 1:
        choice = sys.argv[1].strip()
    else:
        print("Select restoration method:")
        print("  [1] Git-based instant rollback (Checks out v1.0.0-gold-checkpoint)")
        print("  [2] Physical Snapshot File Replacement (Safe for non-git PCs)")
        print("  [Q] Cancel / Exit")
        choice = input("\nEnter choice (1, 2, or Q): ").strip()

    if choice == "1":
        success = restore_from_git(project_root)
    elif choice == "2":
        success = restore_from_physical_backup(project_root)
    else:
        print("Cancelled.")
        return

    if success:
        print("\n🎉 Restoration completed successfully! You can now open index.html directly.")
    else:
        print("\n⚠️ Restoration encountered an issue. Please verify files.")

if __name__ == "__main__":
    main()
