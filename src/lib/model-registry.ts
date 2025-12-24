import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Model, ModelSource } from "@/types";

const DATA_DIR = process.env.DATA_PATH || "./data";
const MODELS_PATH = process.env.MODELS_PATH || "./models";
const REGISTRY_FILE = path.join(DATA_DIR, "models.json");

interface ModelRegistry {
  models: Model[];
}

class ModelRegistryManager {
  private static instance: ModelRegistryManager | null = null;
  private registry: ModelRegistry = { models: [] };
  private initialized = false;

  private constructor() {
    // Don't initialize in constructor - do it lazily
  }

  static getInstance(): ModelRegistryManager {
    if (!ModelRegistryManager.instance) {
      ModelRegistryManager.instance = new ModelRegistryManager();
    }
    // Lazy initialization
    if (!ModelRegistryManager.instance.initialized) {
      ModelRegistryManager.instance.initialize();
    }
    return ModelRegistryManager.instance;
  }

  private initialize(): void {
    if (this.initialized) return;

    try {
      this.ensureDirectories();
      this.loadRegistry();
      this.scanForOrphanedModels();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize model registry:", error);
      // Mark as initialized to prevent repeated attempts
      this.initialized = true;
    }
  }

  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(MODELS_PATH)) {
        fs.mkdirSync(MODELS_PATH, { recursive: true });
      }
    } catch (error) {
      console.error("Failed to create directories:", error);
    }
  }

  private loadRegistry(): void {
    try {
      if (fs.existsSync(REGISTRY_FILE)) {
        const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8"));
        this.registry = data;
        // Validate that models still exist
        this.validateModels();
      }
    } catch (error) {
      console.error("Failed to load model registry:", error);
      this.registry = { models: [] };
    }
  }

  private saveRegistry(): void {
    try {
      this.ensureDirectories();
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(this.registry, null, 2));
    } catch (error) {
      console.error("Failed to save model registry:", error);
    }
  }

  private validateModels(): void {
    const validModels: Model[] = [];
    for (const model of this.registry.models) {
      try {
        if (fs.existsSync(model.path)) {
          // Update size if it changed
          const stats = fs.statSync(model.path);
          model.size = stats.size;
          validModels.push(model);
        } else {
          console.warn(`Model file not found, removing from registry: ${model.path}`);
        }
      } catch {
        console.warn(`Failed to validate model: ${model.path}`);
      }
    }
    this.registry.models = validModels;
    this.saveRegistry();
  }

  private scanForOrphanedModels(): void {
    try {
      if (!fs.existsSync(MODELS_PATH)) return;

      const files = fs.readdirSync(MODELS_PATH);
      const registeredPaths = new Set(this.registry.models.map((m) => m.path));

      for (const file of files) {
        if (!file.endsWith(".gguf")) continue;

        const filePath = path.join(MODELS_PATH, file);
        if (!registeredPaths.has(filePath)) {
          console.log(`Found orphaned model file, registering: ${file}`);
          const stats = fs.statSync(filePath);
          this.registry.models.push({
            id: uuidv4(),
            name: path.basename(file, ".gguf"),
            filename: file,
            path: filePath,
            size: stats.size,
            downloadedAt: stats.mtime.toISOString(),
            source: { type: "url" },
          });
        }
      }
      this.saveRegistry();
    } catch (error) {
      console.error("Failed to scan for orphaned models:", error);
    }
  }

  register(
    name: string,
    filename: string,
    size: number,
    source: ModelSource,
    checksum?: string
  ): Model {
    const modelPath = path.join(MODELS_PATH, filename);

    // Check if model already exists
    const existing = this.registry.models.find((m) => m.path === modelPath);
    if (existing) {
      // Update existing model
      existing.name = name;
      existing.size = size;
      existing.source = source;
      existing.checksum = checksum;
      this.saveRegistry();
      return existing;
    }

    const model: Model = {
      id: uuidv4(),
      name,
      filename,
      path: modelPath,
      size,
      downloadedAt: new Date().toISOString(),
      source,
      checksum,
    };

    this.registry.models.push(model);
    this.saveRegistry();
    return model;
  }

  getModel(id: string): Model | undefined {
    return this.registry.models.find((m) => m.id === id);
  }

  getModelByPath(modelPath: string): Model | undefined {
    return this.registry.models.find((m) => m.path === modelPath);
  }

  getAllModels(): Model[] {
    return [...this.registry.models];
  }

  deleteModel(id: string): boolean {
    const index = this.registry.models.findIndex((m) => m.id === id);
    if (index === -1) return false;

    const model = this.registry.models[index];

    // Delete the file
    try {
      if (fs.existsSync(model.path)) {
        fs.unlinkSync(model.path);
      }
    } catch (error) {
      console.error(`Failed to delete model file: ${model.path}`, error);
      throw new Error(`Failed to delete model file: ${error}`);
    }

    // Remove from registry
    this.registry.models.splice(index, 1);
    this.saveRegistry();
    return true;
  }

  modelExists(filename: string): boolean {
    const modelPath = path.join(MODELS_PATH, filename);
    return fs.existsSync(modelPath);
  }

  getModelsPath(): string {
    return path.resolve(MODELS_PATH);
  }

  getModelPath(filename: string): string {
    return path.join(MODELS_PATH, filename);
  }
}

// Export a getter function instead of the instance directly
// This prevents initialization at module load time
let _modelRegistry: ModelRegistryManager | null = null;

export const modelRegistry = {
  get instance() {
    if (!_modelRegistry) {
      _modelRegistry = ModelRegistryManager.getInstance();
    }
    return _modelRegistry;
  },
  register: (...args: Parameters<ModelRegistryManager["register"]>) =>
    ModelRegistryManager.getInstance().register(...args),
  getModel: (...args: Parameters<ModelRegistryManager["getModel"]>) =>
    ModelRegistryManager.getInstance().getModel(...args),
  getModelByPath: (...args: Parameters<ModelRegistryManager["getModelByPath"]>) =>
    ModelRegistryManager.getInstance().getModelByPath(...args),
  getAllModels: () => ModelRegistryManager.getInstance().getAllModels(),
  deleteModel: (...args: Parameters<ModelRegistryManager["deleteModel"]>) =>
    ModelRegistryManager.getInstance().deleteModel(...args),
  modelExists: (...args: Parameters<ModelRegistryManager["modelExists"]>) =>
    ModelRegistryManager.getInstance().modelExists(...args),
  getModelsPath: () => ModelRegistryManager.getInstance().getModelsPath(),
  getModelPath: (...args: Parameters<ModelRegistryManager["getModelPath"]>) =>
    ModelRegistryManager.getInstance().getModelPath(...args),
};
