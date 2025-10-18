import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";

export default function UnitsManagement() {
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    status: "active",
  });

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    const { data } = await supabase.from("units").select("*").order("name");
    if (data) setUnits(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingUnit) {
        const { error } = await supabase
          .from("units")
          .update(formData)
          .eq("id", editingUnit.id);
        if (error) throw error;
        toast.success("Unidade atualizada!");
      } else {
        const { error } = await supabase.from("units").insert([formData]);
        if (error) throw error;
        toast.success("Unidade criada!");
      }

      setDialogOpen(false);
      setFormData({ name: "", status: "active" });
      setEditingUnit(null);
      fetchUnits();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (unit: any) => {
    setEditingUnit(unit);
    setFormData({ name: unit.name, status: unit.status });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta unidade?")) return;

    try {
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
      toast.success("Unidade excluída!");
      fetchUnits();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Gestão de Unidades
            </CardTitle>
            <CardDescription>Gerencie suas filiais</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingUnit(null); setFormData({ name: "", status: "active" }); }}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Unidade
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUnit ? "Editar" : "Nova"} Unidade</DialogTitle>
                <DialogDescription>Preencha os dados da unidade</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Unidade</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativa</SelectItem>
                      <SelectItem value="inactive">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell className="font-medium">{unit.name}</TableCell>
                <TableCell>
                  <Badge variant={unit.status === "active" ? "default" : "secondary"}>
                    {unit.status === "active" ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(unit)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(unit.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
