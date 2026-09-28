import { vi } from "vitest";
import { acceptedPresentationContract } from "./acceptedPresentationContract.js";
import { resolveAcceptedRevision } from "../src/model/acceptedResolution.js";
import { presentAcceptedRevision } from "../src/model/acceptedPresentation.js";

vi.mock("@gamut-plane/core", { spy: true });
vi.mock("@gamut-plane/core/internal/capabilities", { spy: true });
vi.mock("@gamut-plane/render/internal/capabilities", { spy: true });

acceptedPresentationContract("React", resolveAcceptedRevision, presentAcceptedRevision);
