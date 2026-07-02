"use client";

import { useEffect, useState, useRef, type ComponentProps } from "react";
import { Package, Plus, RefreshCw, ImagePlus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchBar } from "@/components/ui/search-bar";
import { ApiError } from "@/lib/api/client";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { getProducts, createProduct } from "@/lib/api/products";
import { formatCurrency, formatDate } from "@/lib/format";
import { uploadToSupabase } from "@/lib/supabase";
import type { PaginatedResponse } from "@/types/contact";
import type { Product } from "@/types/product";

function inventoryLabel(product: Product) {
  if (!product.trackStock) return "Not tracked";
  if ((product.stockQuantity ?? 0) <= 0) return "Out of stock";
  if (
    product.lowStockAlert !== null &&
    product.lowStockAlert !== undefined &&
    (product.stockQuantity ?? 0) <= product.lowStockAlert
  ) {
    return "Low stock";
  }
  return "In stock";
}

function inventoryVariant(
  product: Product,
): ComponentProps<typeof Badge>["variant"] {
  const label = inventoryLabel(product);
  if (label === "In stock") return "success";
  if (label === "Low stock") return "warning";
  if (label === "Out of stock") return "danger";
  return "neutral";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<PaginatedResponse<Product> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal creation states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("");
  const [lowStockAlert, setLowStockAlert] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Image Upload states
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const productImageInputRef = useRef<HTMLInputElement>(null);

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    setCreateError(null);
    try {
      const url = await uploadToSupabase(file, "products");
      setImageUrl(url);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to upload product image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const timer = window.setTimeout(() => {
      getProducts({ limit: 50, search: search || undefined })
        .then((response) => {
          if (cancelled) return;
          setProducts(response);
          setError(null);
        })
        .catch((requestError) => {
          if (cancelled) return;
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Unable to load products from the backend.",
          );
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, refreshKey]);

  const rows = products?.data ?? [];

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) {
      setCreateError("Name and price are required.");
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setCreateError("Please enter a valid price.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const generatedExternalId = `prod-${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
      await createProduct({
        externalId: generatedExternalId,
        name: name.trim(),
        sku: sku.trim() || undefined,
        price: parsedPrice,
        category: category.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        trackStock,
        stockQuantity: trackStock ? parseInt(stockQuantity) || 0 : undefined,
        lowStockAlert: trackStock ? parseInt(lowStockAlert) || 0 : undefined,
      });
      setIsModalOpen(false);
      // Reset form
      setName("");
      setSku("");
      setCategory("");
      setPrice("");
      setImageUrl("");
      setTrackStock(false);
      setStockQuantity("");
      setLowStockAlert("");
      setShowUrlInput(false);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create product.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button icon={<RefreshCw className="h-4 w-4" />} variant="secondary">
              Sync catalog
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
              Add product
            </Button>
          </>
        }
        description="Monitor catalog health, inventory status and product sync quality from your commerce store."
        eyebrow="Catalog"
        title="Products"
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Product inventory</CardTitle>
            <CardDescription>
              Live SKU-level availability from the backend catalog.
            </CardDescription>
          </div>
          <SearchBar
            className="hidden w-80 md:block"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
            value={search}
          />
        </CardHeader>
        <CardContent>
          <SearchBar
            className="mb-4 md:hidden"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
            value={search}
          />

          {error ? (
            <p className="mb-4 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink">
              {error}
            </p>
          ) : null}

          {isLoading && rows.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">
              Loading products from the backend...
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              description="Products will appear once a commerce integration syncs the catalog."
              icon={Package}
              title="No products found"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {rows.map((product) => (
                <article
                  className="rounded-lg border border-line bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-card"
                  key={product.id}
                >
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-line bg-neutral-50">
                    {product.imageUrl ? (
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        src={product.imageUrl}
                      />
                    ) : (
                      <Package className="h-10 w-10 text-neutral-300" />
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{product.name}</h3>
                        <p className="mt-1 text-xs text-muted">
                          {product.sku ?? product.externalId}
                          {product.category ? ` - ${product.category}` : ""}
                        </p>
                      </div>
                      <span className="font-semibold text-ink">
                        {formatCurrency(product.price)}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Badge variant={inventoryVariant(product)}>
                        {inventoryLabel(product)}
                      </Badge>
                      <span className="text-sm text-muted">
                        {product.trackStock
                          ? `${product.stockQuantity ?? 0} units`
                          : "No stock tracking"}
                      </span>
                    </div>
                    <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-xs text-muted">
                      Synced {formatDate(product.updatedAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Product Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Product">
        <form onSubmit={handleCreateProduct} className="space-y-4">
          {imageUrl && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-line bg-neutral-50 flex items-center justify-center">
              <img src={imageUrl} alt="Product Preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setImageUrl("")}
                className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white hover:bg-black/80 transition"
                title="Remove image"
              >
                ×
              </button>
            </div>
          )}

          <Input
            id="name"
            label="Product Name"
            placeholder="e.g. Premium Cotton T-Shirt"
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isCreating || isUploadingImage}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="sku"
              label="SKU"
              placeholder="e.g. TS-BLUE-L"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              disabled={isCreating || isUploadingImage}
            />
            <Input
              id="category"
              label="Category"
              placeholder="e.g. Apparel"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isCreating || isUploadingImage}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="price"
              label="Price (USD)"
              placeholder="e.g. 29.99"
              required
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={isCreating || isUploadingImage}
            />
            <div className="space-y-2">
              <span className="block text-sm font-medium text-neutral-900">Product Image</span>
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={productImageInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleProductImageUpload}
                />
                <button
                  type="button"
                  onClick={() => productImageInputRef.current?.click()}
                  disabled={isCreating || isUploadingImage}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:border-neutral-400 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {isUploadingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                      <span>Uploading...</span>
                    </>
                  ) : imageUrl ? (
                    <>
                      <ImagePlus className="h-4 w-4 text-blue-500" />
                      <span className="truncate max-w-[120px]">Change image</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-4 w-4 text-neutral-400" />
                      <span>Upload image</span>
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="text-[10px] text-muted hover:text-ink hover:underline block mt-1"
              >
                {showUrlInput ? "Hide URL input" : "Or enter URL manually"}
              </button>
            </div>
          </div>

          {showUrlInput && (
            <Input
              id="imageUrl"
              label="Image URL"
              placeholder="e.g. https://example.com/image.jpg"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={isCreating || isUploadingImage}
            />
          )}

          <div className="border-t border-line pt-4 mt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={trackStock}
                onChange={(e) => setTrackStock(e.target.checked)}
                className="h-4 w-4 rounded border-line text-blue-500 focus:ring-blue-500/20"
                disabled={isCreating || isUploadingImage}
              />
              <span className="text-sm font-semibold text-neutral-900">Track stock inventory</span>
            </label>
          </div>

          {trackStock ? (
            <div className="grid grid-cols-2 gap-4 animate-fade-in">
              <Input
                id="stockQuantity"
                label="Stock Quantity"
                placeholder="e.g. 100"
                type="number"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                disabled={isCreating || isUploadingImage}
              />
              <Input
                id="lowStockAlert"
                label="Low Stock Alert Threshold"
                placeholder="e.g. 10"
                type="number"
                value={lowStockAlert}
                onChange={(e) => setLowStockAlert(e.target.value)}
                disabled={isCreating || isUploadingImage}
              />
            </div>
          ) : null}

          {createError ? (
            <div className="rounded-md border border-red-500/20 bg-red-50 p-3 text-xs text-red-600">
              {createError}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isCreating || isUploadingImage}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || isUploadingImage}>
              {isCreating ? "Adding..." : "Add product"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
