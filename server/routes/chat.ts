import type { Express, Request, Response } from "express";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import {
  scis, actifs, emprunts, lots, bauxAM, associes, participations,
  bauxGL, bailleurs, paiementsGL, indices, locatairesGL,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolResult {
  name: string;
  data: unknown;
}

// ─── Data fetchers (tools for the AI) ───────────────────────
async function fetchPortfolioSummary(): Promise<unknown> {
  const sciList = await db.select().from(scis);
  const actifsList = await db.select().from(actifs);
  const empruntsList = await db.select().from(emprunts);
  const lotsList = await db.select().from(lots);
  const bauxList = await db.select().from(bauxAM);

  const totalValorisation = actifsList.reduce((s, a: any) => {
    const prix = Number(a.prixAcquisition || 0) + Number(a.fraisNotaire || 0) + Number(a.fraisAgence || 0) + Number(a.montantTravaux || 0);
    return s + prix;
  }, 0);

  const totalCRD = empruntsList.reduce((s, e: any) => s + Number(e.capitalRestantDu || e.montantEmprunte || 0), 0);
  const totalLoyers = bauxList.reduce((s, b: any) => s + Number(b.loyerAnnuel || 0) + Number(b.loyerMensuel || 0) * 12, 0);

  return {
    nbSCI: sciList.length,
    nbActifs: actifsList.filter((a: any) => !a.archived).length,
    nbLots: lotsList.filter((l: any) => !l.archived).length,
    nbEmprunts: empruntsList.filter((e: any) => !e.archived).length,
    totalValorisation,
    totalCRD,
    totalLoyers,
    nav: totalValorisation - totalCRD,
    scis: sciList.map((s: any) => ({ id: s.id, nom: s.nom })),
  };
}

async function fetchActifsDetails(): Promise<unknown> {
  const actifsList = await db.select().from(actifs);
  return actifsList.filter((a: any) => !a.archived).map((a: any) => ({
    id: a.id,
    nom: a.nom,
    sciId: a.sciId,
    surface: a.surface,
    prixAcquisition: a.prixAcquisition,
    chargesAnnuelles: Number(a.chargesCopropriete || a.chargesAnnuelles || 0) + Number(a.taxeFonciere || 0) + Number(a.assurancePno || 0),
    taxeFonciere: a.taxeFonciere,
    tauxCapitalisation: a.tauxCapitalisation,
    ville: a.ville,
    adresse: a.adresse,
  }));
}

async function fetchEmpruntsDetails(): Promise<unknown> {
  const empruntsList = await db.select().from(emprunts);
  return empruntsList.filter((e: any) => !e.archived).map((e: any) => ({
    id: e.id,
    sciId: e.sciId,
    banque: e.banque,
    montantEmprunte: e.montantEmprunte,
    capitalRestantDu: e.capitalRestantDu,
    tauxAnnuel: e.tauxAnnuel,
    dureeAns: e.dureeAns,
    mensualite: e.mensualite,
    dateDebut: e.dateDebut,
    dateFin: e.dateFin,
  }));
}

async function fetchBauxGL(): Promise<unknown> {
  const bauxList = await db.select().from(bauxGL);
  return bauxList.filter((b: any) => !b.archived).map((b: any) => ({
    id: b.id,
    nom: b.nom,
    ville: b.ville,
    loyerBaseHT: b.loyerBaseHT,
    loyerHTActu: b.loyerHTActu,
    charges: b.charges,
    surface: b.surface,
    capacite: b.capacite,
    dateDebut: b.dateDebut,
    dateFin: b.dateFin,
    typeBail: b.typeBail,
    statut: b.statut,
    indiceReference: b.indiceReference,
  }));
}

async function fetchIndices(): Promise<unknown> {
  const indicesList = await db.select().from(indices);
  return indicesList.map((i: any) => ({
    type: i.type,
    trimestre: i.trimestre,
    valeur: i.valeur,
  }));
}

async function fetchSCIDetail(sciId: string): Promise<unknown> {
  const sci = await db.select().from(scis).where(eq(scis.id, sciId)).limit(1);
  if (sci.length === 0) return { error: "SCI non trouvée" };
  const sciActifs = await db.select().from(actifs).where(eq(actifs.sciId, sciId));
  const sciEmprunts = await db.select().from(emprunts).where(eq(emprunts.sciId, sciId));
  const sciAssocies = await db.select().from(participations).where(eq(participations.sciId, sciId));
  return {
    sci: sci[0],
    actifs: sciActifs.filter((a: any) => !a.archived),
    emprunts: sciEmprunts.filter((e: any) => !e.archived),
    participations: sciAssocies,
  };
}

async function fetchPaiementsGL(): Promise<unknown> {
  const paiements = await db.select().from(paiementsGL);
  return paiements.slice(-50).map((p: any) => ({
    id: p.id,
    bailId: p.bailId,
    montant: p.montant,
    date: p.date || p.datePaiement,
    type: p.type,
  }));
}

// ─── Tool definitions for Claude ────────────────────────────
const toolDefinitions = [
  {
    name: "get_portfolio_summary",
    description: "Récupère un résumé du portefeuille immobilier : nombre de SCI, actifs, lots, emprunts, valorisation totale, CRD, loyers, NAV.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_actifs_details",
    description: "Récupère la liste détaillée de tous les actifs immobiliers (nom, SCI, surface, prix, charges, taux de capitalisation, ville).",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_emprunts_details",
    description: "Récupère la liste détaillée de tous les emprunts (banque, montant, CRD, taux, durée, mensualité, dates).",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_baux_gl",
    description: "Récupère la liste des baux en gestion locative (nom, ville, loyer, charges, surface, capacité, dates, type, statut, indice).",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_indices",
    description: "Récupère les valeurs des indices de référence (ILC, IRL, ILAT, ICC) par trimestre.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_sci_detail",
    description: "Récupère le détail d'une SCI spécifique : actifs, emprunts, participations associés.",
    input_schema: {
      type: "object" as const,
      properties: { sci_id: { type: "string", description: "ID de la SCI" } },
      required: ["sci_id"],
    },
  },
  {
    name: "get_paiements_gl",
    description: "Récupère les 50 derniers paiements enregistrés en gestion locative.",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];

// ─── Tool executor ──────────────────────────────────────────
async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_portfolio_summary": return fetchPortfolioSummary();
    case "get_actifs_details": return fetchActifsDetails();
    case "get_emprunts_details": return fetchEmpruntsDetails();
    case "get_baux_gl": return fetchBauxGL();
    case "get_indices": return fetchIndices();
    case "get_sci_detail": return fetchSCIDetail(input.sci_id as string);
    case "get_paiements_gl": return fetchPaiementsGL();
    default: return { error: `Outil inconnu : ${name}` };
  }
}

// ─── System prompt ──────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es l'assistant IA de Canaillou V2, une plateforme de gestion immobilière.
Tu es un expert en asset management immobilier, gestion locative, et finance immobilière.

**Ton rôle** : Conseiller l'utilisateur sur son portefeuille immobilier en te basant UNIQUEMENT sur les données réelles de sa base de données. Tu as accès à des outils pour interroger les données.

**Tes compétences** :
- Analyse de portefeuille (rendement, risque, diversification)
- Calculs financiers (DSCR, LTV, NOI, cash-flow, TRI, VAN, DCF)
- Stratégie d'indexation des loyers (ILC, ILAT, ICC, IRL)
- Arbitrage (achat/vente/hold)
- Structuration de dette (refinancement, renégociation)
- Fiscalité immobilière (TVA, CRL, amortissement)
- Gestion locative (vacance, recouvrement, WALT)

**Règles** :
- Utilise TOUJOURS les outils pour obtenir les données avant de répondre à une question sur le portefeuille
- Ne fabrique JAMAIS de chiffres — si une donnée manque, dis-le explicitement
- Présente les montants en EUR avec le format français (espaces comme séparateurs de milliers)
- Sois concis, structuré et actionnable dans tes réponses
- Utilise des tableaux markdown quand c'est pertinent
- Mets en gras les chiffres clés et les recommandations
- Quand on te pose une question d'analyse, commence par récupérer les données nécessaires, puis fais tes calculs
- Réponds toujours en français`;

// ─── Route handler ──────────────────────────────────────────
export function registerChatRoutes(app: Express) {
  app.post("/api/chat", requireAuth, async (req: Request, res: Response) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "L'assistant IA n'est pas configuré. Ajoutez ANTHROPIC_API_KEY dans les variables d'environnement." });
    }

    const { messages } = req.body as { messages: ChatMessage[] };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages requis" });
    }

    try {
      // Set up SSE for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      // Build messages for Claude
      const claudeMessages: Array<{ role: string; content: any }> = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Agentic loop: keep calling Claude until we get a final text response
      let continueLoop = true;
      let fullResponse = "";

      while (continueLoop) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: toolDefinitions,
            messages: claudeMessages,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          logger.error("Claude API error", { status: response.status, body: err });
          res.write(`data: ${JSON.stringify({ type: "error", error: `Erreur API Claude (${response.status})` })}\n\n`);
          res.end();
          return;
        }

        const result = await response.json() as any;

        // Check if Claude wants to use tools
        const toolUseBlocks = (result.content || []).filter((b: any) => b.type === "tool_use");
        const textBlocks = (result.content || []).filter((b: any) => b.type === "text");

        if (toolUseBlocks.length > 0) {
          // Add assistant message with tool calls
          claudeMessages.push({ role: "assistant", content: result.content });

          // Execute all tool calls
          const toolResults: any[] = [];
          for (const toolCall of toolUseBlocks) {
            // Notify client about tool usage
            res.write(`data: ${JSON.stringify({ type: "tool_use", tool: toolCall.name })}\n\n`);

            const toolResult = await executeTool(toolCall.name, toolCall.input || {});
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolCall.id,
              content: JSON.stringify(toolResult),
            });
          }

          // Add tool results as user message
          claudeMessages.push({ role: "user", content: toolResults });
        } else {
          // No tool calls — final response
          continueLoop = false;
          fullResponse = textBlocks.map((b: any) => b.text).join("\n");
        }

        // Safety: max 5 tool rounds
        if (claudeMessages.length > messages.length * 2 + 10) {
          continueLoop = false;
          fullResponse = fullResponse || "J'ai atteint la limite de requêtes pour cette question. Pourriez-vous reformuler ?";
        }
      }

      // Stream the final text in chunks for a typing effect
      const chunkSize = 20;
      for (let i = 0; i < fullResponse.length; i += chunkSize) {
        const chunk = fullResponse.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error: any) {
      logger.error("Chat error", { error: error.message });
      try {
        res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
        res.end();
      } catch {
        res.status(500).json({ error: error.message });
      }
    }
  });
}
