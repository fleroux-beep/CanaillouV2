import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { PageHeader } from "../../components/ui/page-header";
import { EmpruntsTab } from "./emprunts/EmpruntsTab";
import { AmortissementTab } from "./emprunts/AmortissementTab";
import { CoutCreditTab } from "./emprunts/CoutCreditTab";
import { RachatCreditTab } from "./emprunts/RachatCreditTab";

export default function EmpruntsPage() {
  const [activeTab, setActiveTab] = useState("emprunts");

  return (
    <div className="space-y-6">
      <PageHeader title="Emprunts & Financements" description="Gestion des emprunts, coût du crédit et simulation de rachat" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="emprunts">Emprunts</TabsTrigger>
          <TabsTrigger value="amortissement">Amortissement</TabsTrigger>
          <TabsTrigger value="cout-credit">Coût du crédit</TabsTrigger>
          <TabsTrigger value="rachat-credit">Rachat de crédit</TabsTrigger>
        </TabsList>
        <TabsContent value="emprunts">
          <EmpruntsTab />
        </TabsContent>
        <TabsContent value="amortissement">
          <AmortissementTab />
        </TabsContent>
        <TabsContent value="cout-credit">
          <CoutCreditTab />
        </TabsContent>
        <TabsContent value="rachat-credit">
          <RachatCreditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
