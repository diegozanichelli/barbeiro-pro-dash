import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Package, Scissors, Zap, Pencil, Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import CatalogItemModal from "./CatalogItemModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CatalogService {
  id: string;
  name: string;
  default_price: number;
  category: string;
  fixed_commission: number | null;
  is_active: boolean;
}

interface CatalogProduct {
  id: string;
  name: string;
  default_price: number;
  fixed_commission: number | null;
  is_active: boolean;
}

export default function CatalogManagement() {
  const { organizationId, loading: orgLoading } = useOrganization();
  const [services, setServices] = useState<CatalogService[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"service" | "product">("service");
  const [editingItem, setEditingItem] = useState<CatalogService | CatalogProduct | null>(null);

  const fetchCatalog = async () => {
    if (!organizationId) return;

    try {
      const [servicesRes, productsRes] = await Promise.all([
        supabase
          .from("catalog_services")
          .select("*")
          .eq("organization_id", organizationId)
          .order("category")
          .order("name"),
        supabase
          .from("catalog_products")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name"),
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (productsRes.error) throw productsRes.error;

      setServices(servicesRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error("Error fetching catalog:", error);
      toast.error("Erro ao carregar catálogo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      fetchCatalog();
    }
  }, [organizationId]);

  const handleToggleActive = async (
    type: "service" | "product",
    id: string,
    currentValue: boolean
  ) => {
    try {
      const table = type === "service" ? "catalog_services" : "catalog_products";
      const { error } = await supabase
        .from(table)
        .update({ is_active: !currentValue })
        .eq("id", id);

      if (error) throw error;
      await fetchCatalog();
      toast.success(`Item ${!currentValue ? "ativado" : "desativado"}`);
    } catch (error) {
      console.error("Error toggling item:", error);
      toast.error("Erro ao atualizar item");
    }
  };

  const handleEdit = (type: "service" | "product", item: CatalogService | CatalogProduct) => {
    setModalType(type);
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleNewItem = (type: "service" | "product") => {
    setModalType(type);
    setEditingItem(null);
    setModalOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Central de Catálogo e Comissões
              </CardTitle>
              <CardDescription>
                Gerencie serviços e produtos com comissões fixas opcionais
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleNewItem("service")} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Novo Serviço
              </Button>
              <Button onClick={() => handleNewItem("product")} variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Novo Produto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Services Section */}
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Scissors className="h-5 w-5" />
              Serviços
            </h3>
            {services.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Comissão</TableHead>
                      <TableHead className="text-center">Ativo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((service) => (
                      <TableRow key={service.id}>
                        <TableCell className="font-medium">{service.name}</TableCell>
                        <TableCell>{formatCurrency(service.default_price)}</TableCell>
                        <TableCell>
                          <Badge variant={service.category === "basic" ? "secondary" : "default"}>
                            {service.category === "basic" ? "Básico" : "Extra"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {service.fixed_commission !== null ? (
                            <div className="flex items-center gap-1 text-amber-600">
                              <Zap className="h-4 w-4" />
                              <span className="font-medium">{service.fixed_commission}%</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Plano de carreira</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={service.is_active}
                            onCheckedChange={() =>
                              handleToggleActive("service", service.id, service.is_active)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit("service", service)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Scissors className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Nenhum serviço cadastrado</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Clique em "Novo Serviço" para adicionar
                </p>
              </div>
            )}
          </div>

          {/* Products Section */}
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Package className="h-5 w-5" />
              Produtos
            </h3>
            {products.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Comissão</TableHead>
                      <TableHead className="text-center">Ativo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{formatCurrency(product.default_price)}</TableCell>
                        <TableCell>
                          {product.fixed_commission !== null ? (
                            <div className="flex items-center gap-1 text-amber-600">
                              <Zap className="h-4 w-4" />
                              <span className="font-medium">{product.fixed_commission}%</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Plano de carreira</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={product.is_active}
                            onCheckedChange={() =>
                              handleToggleActive("product", product.id, product.is_active)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit("product", product)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Nenhum produto cadastrado</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Clique em "Novo Produto" para adicionar
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {organizationId && (
        <CatalogItemModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          organizationId={organizationId}
          type={modalType}
          item={editingItem}
          onSuccess={fetchCatalog}
        />
      )}
    </div>
  );
}
