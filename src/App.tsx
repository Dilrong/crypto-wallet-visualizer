import { useState, useRef, useEffect } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, sha256 } from "viem";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist as wordlist_english } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Analytics } from "@vercel/analytics/react";

const styles = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes byteFill {
    from { width: 0; opacity: 0; }
    to { width: 100%; opacity: 1; }
  }
  @keyframes highlight {
    0% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5); }
    100% { box-shadow: none; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .step-result { animation: slideIn 0.3s ease-out; }
  .hex-block { display: inline-block; width: 12px; height: 12px; margin-right: 2px; animation: byteFill 0.5s ease-in-out; border-radius: 2px; }
  .mnemonic-phrase { white-space: pre-wrap; word-wrap: break-word; }
  .scroll-container { overflow-x: auto; max-width: 100%; }
  .input-card { transition: transform 0.2s; }
  .input-card:hover { transform: scale(1.02); }
  .result-card { border-left: 4px solid #388e3c; transition: box-shadow 0.3s; }
  .result-card.highlight { animation: highlight 1s ease-out; }
  .float-button { position: fixed; bottom: 20px; right: 20px; z-index: 1000; }
  .react-flow__node { border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; color: white; cursor: pointer; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
  .react-flow__node-seed { background: #1e88e5; }
  .react-flow__node-master { background: #388e3c; }
  .react-flow__node-derived { background: #f57c00; }
  .react-flow__edge-path { stroke: #888; stroke-width: 2; }
  .interactive-box { border: 1px dashed #ccc; padding: 10px; border-radius: 5px; background: #f9fafb; }
  .result-preview { animation: fadeIn 1s ease-out; white-space: pre-wrap; word-wrap: break-word; max-width: 100%; overflow-wrap: break-word; }
  .draggable-word { display: inline-block; padding: 5px 10px; margin: 5px; background: #e2e8f0; border-radius: 5px; cursor: move; }
  .selectable-word { display: inline-block; padding: 5px 10px; margin: 5px; background: #e2e8f0; border-radius: 5px; cursor: pointer; }
  .selected-word { background: #93c5fd; }
  .guide-text { font-size: 0.9rem; color: #666; margin-bottom: 10px; }
  .address-highlight { background: #ffeb3b; padding: 2px 5px; border-radius: 3px; }
  .warning-text { color: #e53e3e; font-size: 0.9rem; }
  .footer { margin-top: 20px; text-align: center; color: #666; }
`;

const ItemTypes = {
  WORD: "word",
};

const DraggableWord = ({
  word,
  index,
  moveWord,
}: {
  word: string;
  index: number;
  moveWord: (dragIndex: number, hoverIndex: number) => void;
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.WORD,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: ItemTypes.WORD,
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        moveWord(item.index, index);
        item.index = index;
      }
    },
  });

  const ref = (node: HTMLSpanElement | null) => {
    drag(node);
    drop(node);
  };

  return (
    <span
      ref={ref}
      className="draggable-word"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {word}
    </span>
  );
};

function App() {
  const [step, setStep] = useState<number>(0);
  const [results, setResults] = useState<string[]>([]);
  const [mnemonic, setMnemonic] = useState<string>("");
  const [derivationPath, setDerivationPath] =
    useState<string>("m/44'/60'/0'/0/0");
  const [customPath, setCustomPath] = useState<string>("");
  const [useCustomPath, setUseCustomPath] = useState<boolean>(false);
  const [privateKey, setPrivateKey] = useState<string>("");
  const [publicKey, setPublicKey] = useState<`0x${string}` | "">("");
  const [entropy, setEntropy] = useState<string>("");
  const [checksum, setChecksum] = useState<string>("");

  const [seed, setSeed] = useState<string>("");
  const [language, setLanguage] = useState<"ko" | "en">("en");
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [accordionValue, setAccordionValue] = useState<string[]>([]);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([]);
  const [pathSegments, setPathSegments] = useState<string[]>([]);
  const [publicKeyPreview, setPublicKeyPreview] = useState<string>("");
  const [hashLength, setHashLength] = useState<number>(0);
  const [applyChecksum, setApplyChecksum] = useState<boolean>(false);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

  const stepDescriptionsKo = [
    "니모닉 생성: 엔트로피와 니모닉을 자동 생성합니다.",
    "개인 키 파생: 경로를 선택하거나 입력해 개인 키를 생성합니다.",
    "공개 키 생성: 개인 키에서 공개 키를 생성합니다。",
    "Keccak-256 해시: 공개 키에서 해시를 생성합니다。",
    "주소 추출: 해시에서 주소를 추출합니다。",
    "EIP-55 체크섬 적용: 주소에 체크섬을 적용합니다。",
    "최종 주소: '0x' 접두사를 붙여 주소를 완성합니다。",
  ];

  const stepDescriptionsEn = [
    "Mnemonic Generation: Automatically generates entropy and mnemonic.",
    "Private Key Derivation: Select or enter a path to generate private keys.",
    "Public Key Generation: Generate a public key from the private key.",
    "Keccak-256 Hash: Generate a hash from the public key.",
    "Address Extraction: Extract the address from the hash.",
    "EIP-55 Checksum: Apply checksum to the address.",
    "Final Address: Add '0x' prefix to complete the address.",
  ];

  const stepDetailsKo = [
    [
      "엔트로피: 128비트 자동 생성",
      "니모닉: 12단어 자동 생성",
      "결과: 니모닉 단어와 체크섬",
    ],
    ["경로 선택 또는 입력: 예: m/44'/60'/0'/0/0", "결과: 개인 키 파생"],
    ["ECDSA secp256k1 적용: 개인 키 → 공개 키 (64바이트)"],
    ["Keccak-256 계산: 공개 키 → 32바이트 해시"],
    ["마지막 20바이트 추출: 160비트 주소"],
    ["소문자 변환", "Keccak-256 해싱", "대소문자 결정: nibble ≥ 8 → 대문자"],
    ["'0x' 접두사 추가"],
  ];

  const stepDetailsEn = [
    [
      "Entropy: 128-bit auto-generated",
      "Mnemonic: 12 words auto-generated",
      "Result: Mnemonic words and checksum",
    ],
    [
      "Path Selection or Input: e.g., m/44'/60'/0'/0/0",
      "Result: Private key derivation",
    ],
    ["ECDSA secp256k1 Applied: Private Key → Public Key (64 bytes)"],
    ["Keccak-256 Calculation: Public Key → 32-byte Hash"],
    ["Last 20 Bytes Extracted: 160-bit Address"],
    [
      "Lowercase Conversion",
      "Keccak-256 Hashing",
      "Case Decision: nibble ≥ 8 → Uppercase",
    ],
    ["'0x' Prefix Added"],
  ];

  const onboardingGuidesKo = [
    "먼저 비밀 문장(니모닉)을 만들어볼까요? 단어를 드래그해 나만의 문장을 완성하세요!",
    "이제 문장에서 개인 키를 뽑아낼 경로를 선택해주세요.",
    "개인 키를 공개 키로 변환해봅시다. '변환 시작'을 눌러보세요!",
    "공개 키를 해시로 바꿔볼까요? 슬라이더를 조정하고 '해시 생성 완료'를 눌러보세요!",
    "해시에서 주소를 뽑아낼 시간이에요. '주소 추출'을 눌러보세요!",
    "주소에 안전장치(체크섬)를 추가할까요? 토글을 켜고 '체크섬 적용 완료'를 눌러보세요!",
    "마지막으로 주소를 포장해봅시다. '포장' 버튼을 눌러보세요!",
  ];

  const onboardingGuidesEn = [
    "Let’s start by creating a secret phrase (mnemonic). Drag the words to make your own phrase!",
    "Now, choose a path to derive a private key from your phrase.",
    "Time to turn the private key into a public key. Click 'Start Conversion'!",
    "Let’s hash the public key. Adjust the slider and click 'Finish Hash Creation'!",
    "Extract an address from the hash. Click 'Extract Address'!",
    "Add a safety lock (checksum) to the address. Toggle it on and click 'Finish Checksum Application'!",
    "Finally, wrap the address. Click 'Wrap' to finish!",
  ];

  const handleStepClick = async (index: number) => {
    if (index > step) return;

    const effectivePath =
      useCustomPath && customPath ? customPath : derivationPath;

    switch (index) {
      case 0: {
        const entropyBytes = crypto.getRandomValues(new Uint8Array(16));
        const entropyHex = `0x${Array.from(entropyBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`;
        const checksumHash = sha256(
          `0x${Array.from(entropyBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")}`
        );
        const checksumBits = checksumHash.slice(0, 1);
        const newMnemonic = generateMnemonic(wordlist_english);
        setEntropy(entropyHex);
        setChecksum(`0x${checksumBits}`);
        setMnemonic(newMnemonic);
        setMnemonicWords(newMnemonic.split(" "));
        setResults([
          `Entropy: ${entropyHex}`,
          `Checksum: 0x${checksumBits}`,
          `Mnemonic Phrase: ${newMnemonic}`,
        ]);
        break;
      }
      case 1: {
        if (!mnemonic) return;
        if (!effectivePath || !/^m(\/\d+'?)+$/.test(effectivePath)) {
          alert(
            language === "ko"
              ? "유효한 경로를 입력하세요 (예: m/44'/60'/0'/0/0)."
              : "Enter a valid path (e.g., m/44'/60'/0'/0/0)."
          );
          return;
        }
        const seedBytes = mnemonicToSeedSync(mnemonic);
        const seedHex = `0x${Array.from(seedBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`;
        setSeed(seedHex);
        console.log(seed);
        const hdKey = HDKey.fromMasterSeed(seedBytes);
        const masterPrivateKey = `0x${Array.from(hdKey.privateKey!)
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
        const childKey1 = hdKey.derive(effectivePath);
        const derivedPrivateKey1 = `0x${Array.from(childKey1.privateKey!)
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
        setPrivateKey(derivedPrivateKey1);
        setResults([
          ...results.slice(0, 3),
          `Seed: ${seedHex}`,
          `Master Private Key: ${masterPrivateKey}`,
          `Derived Private Key (Path: ${effectivePath}): ${derivedPrivateKey1}`,
        ]);
        setStep(2);
        setAccordionValue([
          "item-0",
          "item-1",
          "item-2",
          "item-3",
          "item-4",
          "item-5",
        ]);
        break;
      }
      case 2: {
        if (!privateKey) return;
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        setPublicKeyPreview(
          `${privateKey.slice(0, 10)}...${privateKey.slice(-10)}`
        );
        setTimeout(() => {
          setPublicKeyPreview(
            `${account.publicKey.slice(0, 10)}...${account.publicKey.slice(
              -10
            )}`
          );
          setTimeout(() => {
            setPublicKey(account.publicKey);
            setPublicKeyPreview(
              `${account.publicKey.slice(0, 10)}...${account.publicKey.slice(
                -10
              )}`
            );
            setResults([
              ...results.slice(0, 6),
              `Public Key: ${account.publicKey}`,
            ]);
            setStep(3);
            setAccordionValue([
              "item-0",
              "item-1",
              "item-2",
              "item-3",
              "item-4",
              "item-5",
              "item-6",
            ]);
          }, 1000);
        }, 1000);
        break;
      }
      case 3: {
        if (!publicKey) {
          console.error("Public key not found:", publicKey);
          return;
        }
        const publicKeyHash = keccak256(publicKey);
        setResults((prev) => {
          const newResults = [...prev];
          newResults[7] = `Keccak-256 Hash: ${publicKeyHash}`;
          return newResults;
        });
        setStep(4);
        setAccordionValue([
          "item-0",
          "item-1",
          "item-2",
          "item-3",
          "item-4",
          "item-5",
          "item-6",
          "item-7",
        ]);
        break;
      }
      case 4: {
        const publicKeyHashLast = results[7]?.split(": ")[1];
        if (!publicKeyHashLast) {
          console.error("Public key hash not found in results:", results);
          return;
        }
        const addressRaw = publicKeyHashLast.slice(-40);
        setResults((prev) => {
          const newResults = [...prev];
          newResults[8] = `Raw Address: 0x${addressRaw}`;
          return newResults;
        });
        setTimeout(() => {
          setStep(5);
          setAccordionValue([
            "item-0",
            "item-1",
            "item-2",
            "item-3",
            "item-4",
            "item-5",
            "item-6",
            "item-7",
            "item-8",
          ]);
        }, 100);
        break;
      }
      case 5: {
        const rawAddress = results[8]?.split(": ")[1];
        if (!rawAddress) {
          console.error("Raw address not found in results:", results);
          return;
        }
        const checksumAddress = toChecksumAddress(rawAddress);
        setApplyChecksum(true);
        setResults((prev) => {
          const newResults = [...prev];
          newResults[9] = `Checksum Address: ${checksumAddress}`;
          return newResults;
        });
        setStep(6);
        setAccordionValue([
          "item-0",
          "item-1",
          "item-2",
          "item-3",
          "item-4",
          "item-5",
          "item-6",
          "item-7",
          "item-8",
          "item-9",
        ]);
        break;
      }
      case 6: {
        const finalAddress = results[9]?.split(": ")[1];
        if (!finalAddress) {
          console.error("Checksum address not found in results:", results);
          return;
        }
        setResults((prev) => {
          const newResults = [...prev];
          newResults[10] = `Final Address: ${finalAddress}`;
          return newResults;
        });
        setStep(7);
        setAccordionValue([
          "item-0",
          "item-1",
          "item-2",
          "item-3",
          "item-4",
          "item-5",
          "item-6",
          "item-7",
          "item-8",
          "item-9",
          "item-10",
        ]);
        break;
      }
      default:
        break;
    }

    if (resultRefs.current[index]) {
      setHighlightedIndex(index);
      resultRefs.current[index]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setTimeout(() => setHighlightedIndex(null), 1000);
    }
  };

  const moveWord = (dragIndex: number, hoverIndex: number) => {
    const draggedWord = mnemonicWords[dragIndex];
    const newWords = [...mnemonicWords];
    newWords.splice(dragIndex, 1);
    newWords.splice(hoverIndex, 0, draggedWord);
    setMnemonicWords(newWords);
  };

  const handleMnemonicComplete = () => {
    const newMnemonic = mnemonicWords.join(" ");
    setMnemonic(newMnemonic);
    setResults((prev) => {
      const newResults = [...prev];
      newResults[2] = `Mnemonic Phrase: ${newMnemonic}`;
      return newResults;
    });
    setStep(1);
    setAccordionValue(["item-0", "item-1", "item-2"]);
  };

  const handlePathSegmentClick = (segment: string) => {
    setPathSegments((prev) => {
      const newSegments = prev.includes(segment)
        ? prev.filter((s) => s !== segment)
        : [...prev, segment];
      const newPath = `m/${newSegments.join("/")}`;
      setDerivationPath(newPath);
      return newSegments;
    });
  };

  const handleHashLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setHashLength(value);
  };

  const handleFinishHashCreation = () => {
    if (hashLength < 64) {
      alert(
        language === "ko"
          ? "슬라이더를 64 이상으로 조정해주세요!"
          : "Please adjust the slider to 64 or more!"
      );
      return;
    }
    handleStepClick(3);
  };

  const handleFinishChecksumApplication = () => {
    if (!applyChecksum) {
      alert(
        language === "ko"
          ? "체크섬 토글을 켜주세요!"
          : "Please turn on the checksum toggle!"
      );
      return;
    }
    handleStepClick(5);
  };

  const handleChecksumToggle = (pressed: boolean) => {
    setApplyChecksum(pressed);
  };

  const resetAll = () => {
    setStep(0);
    setResults([]);
    setMnemonic("");
    setDerivationPath("m/44'/60'/0'/0/0");
    setCustomPath("");
    setUseCustomPath(false);
    setPrivateKey("");
    setPublicKey("");
    setEntropy("");
    setChecksum("");
    setSeed("");
    setHighlightedIndex(null);
    setAccordionValue([]);
    setMnemonicWords([]);
    setPathSegments([]);
    setPublicKeyPreview("");
    setHashLength(0);
    setApplyChecksum(false);
  };

  const toggleAccordion = (expand: boolean) => {
    if (expand) {
      setAccordionValue(results.map((_, idx) => `item-${idx}`));
    } else {
      setAccordionValue([]);
    }
  };

  useEffect(() => {
    if (results.length > 0) {
      const latestIndex = results.length - 1;
      setTimeout(() => {
        resultRefs.current[latestIndex]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    }
  }, [results]);

  const toChecksumAddress = (address: string): string => {
    const cleanAddress = address.toLowerCase().replace("0x", "");
    const hash = keccak256(`0x${cleanAddress}` as `0x${string}`);
    let checksummed = "0x";
    for (let i = 0; i < cleanAddress.length; i++) {
      checksummed +=
        parseInt(hash[i], 16) >= 8
          ? cleanAddress[i].toUpperCase()
          : cleanAddress[i];
    }
    return checksummed;
  };

  const renderHexBlocks = (hex: string, className: string) => {
    const bytes = hex.replace("0x", "").match(/.{1,2}/g) || [];
    return (
      <div className="flex flex-wrap gap-1">
        {bytes.map((byte, idx) => (
          <div
            key={idx}
            className={`hex-block ${className}`}
            style={{
              background: `#${byte}ff`,
              transitionDelay: `${idx * 0.02}s`,
            }}
            title={`Byte ${idx}: 0x${byte}`}
          />
        ))}
      </div>
    );
  };

  const renderMnemonicBits = (
    mnemonic: string,
    entropy: string,
    checksum: string
  ) => {
    const entropyBits = entropy.replace("0x", "").slice(0, 32);
    const checksumBits = checksum.replace("0x", "").slice(0, 1);
    const fullBits = `${entropyBits}${checksumBits}`;
    const binary = BigInt(`0x${fullBits}`).toString(2).padStart(132, "0");
    const chunks = binary.match(/.{1,11}/g) || [];
    const words = mnemonic.split(" ");

    return (
      <table className="text-sm w-full mt-2 border-collapse">
        <thead>
          <tr>
            <th className="border p-2">11-bit Chunk</th>
            <th className="border p-2">Decimal</th>
            <th className="border p-2">Word</th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((chunk, idx) => (
            <tr key={idx}>
              <td className="border p-2">{chunk}</td>
              <td className="border p-2">{parseInt(chunk, 2)}</td>
              <td className="border p-2">{words[idx]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderChecksumProcess = (address: string, hash: string) => {
    const cleanAddress = address.toLowerCase().replace("0x", "");
    const hashNibbles = hash.replace("0x", "").split("");

    return (
      <div className="flex flex-col gap-1">
        <div className="font-mono">Address: ${cleanAddress}</div>
        <div className="font-mono">Hash: ${hash}</div>
        <div className="flex gap-1 flex-wrap">
          {cleanAddress.split("").map((char, idx) => {
            const nibble = parseInt(hashNibbles[idx], 16);
            const isUpper = nibble >= 8;
            return (
              <span
                key={idx}
                className={`hex-block ${
                  isUpper ? "bg-yellow-300" : "bg-gray-300"
                }`}
                title={`Nibble: ${nibble} (${isUpper ? "Upper" : "Lower"})`}
              >
                {isUpper ? char.toUpperCase() : char}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const pathDescriptionsKo = [
    "시작점: 마스터 키",
    "목적: 지갑 구조 정의 (BIP-44)",
    "코인: 이더리움 (60)",
    "계정: 첫 번째 계정 (0)",
    "체인: 외부 주소용 (0)",
    "인덱스: 선택한 키",
  ];

  const pathDescriptionsEn = [
    "Starting Point: Master Key",
    "Purpose: Wallet Structure (BIP-44)",
    "Coin: Ethereum (60)",
    "Account: First Account (0)",
    "Chain: External Addresses (0)",
    "Index: Selected Key",
  ];

  const renderDerivationVisualization = () => {
    const descriptions =
      language === "ko" ? pathDescriptionsKo : pathDescriptionsEn;
    const effectivePath =
      useCustomPath && customPath ? customPath : derivationPath;
    const pathSegments = effectivePath.split("/").filter(Boolean);

    const nodes = [
      {
        id: "seed",
        type: "seed",
        data: { label: "① Seed" },
        position: { x: 250, y: 0 },
        className: "react-flow__node-seed",
      },
      ...pathSegments.map((segment, idx) => ({
        id: `${idx + 1}`,
        type: idx === pathSegments.length - 1 ? "derived" : "master",
        data: { label: `${idx + 2} ${segment}` },
        position: { x: 250 - idx * 60, y: 100 + idx * 100 },
        className:
          idx === pathSegments.length - 1
            ? "react-flow__node-derived"
            : "react-flow__node-master",
      })),
    ];

    const edges = nodes.slice(0, -1).map((node, idx) => ({
      id: `e${idx + 1}`,
      source: node.id,
      target: nodes[idx + 1].id,
      animated: true,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleNodeClick = (_event: any, node: any) => {
      const stepIndex = parseInt(node.id === "seed" ? "0" : node.id) - 1;
      if (resultRefs.current[stepIndex]) {
        setHighlightedIndex(stepIndex);
        resultRefs.current[stepIndex]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setTimeout(() => setHighlightedIndex(null), 1000);
      }
    };

    return (
      <TooltipProvider>
        <Card className="mt-4 shadow-md">
          <CardContent className="p-4">
            <p className="text-sm text-gray-600 font-semibold">
              {language === "ko"
                ? "개인 키 파생 과정 (쉽게 설명):"
                : "Private Key Derivation Process (Simplified):"}
            </p>
            <ul className="text-sm text-gray-600 list-disc pl-5 mt-1">
              <li>
                {language === "ko"
                  ? "1. Seed: 니모닉에서 생성된 초기 비밀값입니다。"
                  : "1. Seed: Initial secret value generated from the mnemonic。"}
              </li>
              <li>
                {language === "ko"
                  ? "2. Master Key: Seed에서 만들어진 루트 키입니다。"
                  : "2. Master Key: Root key derived from the Seed。"}
              </li>
              <li>
                {language === "ko"
                  ? "3. Path Application: 아래 경로를 따라 자식 키를 만듭니다。"
                  : "3. Path Application: Child keys are derived along the path below。"}
              </li>
            </ul>
            <div className="mt-4" style={{ height: "500px" }}>
              <ReactFlow
                nodes={nodes.map((node, idx) => ({
                  ...node,
                  data: { ...node.data, tooltip: descriptions[idx] },
                }))}
                edges={edges}
                onNodeClick={handleNodeClick}
                fitView
              >
                <Background />
                <Controls />
                {nodes.map((node, idx) => (
                  <Tooltip key={node.id}>
                    <TooltipTrigger asChild>
                      <div
                        style={{
                          position: "absolute",
                          left: node.position.x,
                          top: node.position.y,
                          width: 80,
                          height: 80,
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{descriptions[idx]}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </ReactFlow>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              {language === "ko"
                ? `경로: ${effectivePath}`
                : `Path: ${effectivePath}`}
            </p>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderFlowDiagramScrollable = () => (
    <Card className="mt-4 shadow-md">
      <CardContent className="p-4">
        <div className="scroll-container">
          <svg width="800" height="120" viewBox="0 0 800 120">
            <rect x="10" y="10" width="100" height="40" fill="#ff6b6b" rx="5" />
            <text x="20" y="35" fontSize="12">
              {language === "ko" ? "엔트로피" : "Entropy"}
            </text>
            <path d="M110 30 H150" stroke="gray" />
            <rect
              x="150"
              y="10"
              width="100"
              height="40"
              fill="#4ecdc4"
              rx="5"
            />
            <text x="160" y="35" fontSize="12">
              {language === "ko" ? "체크섬" : "Checksum"}
            </text>
            <path d="M250 30 H290" stroke="gray" />
            <rect
              x="290"
              y="10"
              width="100"
              height="40"
              fill="#fef3c7"
              rx="5"
            />
            <text x="300" y="35" fontSize="12">
              {language === "ko" ? "니모닉" : "Mnemonic"}
            </text>
            <path d="M390 30 H430" stroke="gray" />
            <rect
              x="430"
              y="10"
              width="100"
              height="40"
              fill="#1e88e5"
              rx="5"
            />
            <text x="440" y="35" fontSize="12">
              {language === "ko" ? "시드" : "Seed"}
            </text>
            <path d="M530 30 H570" stroke="gray" />
            <rect
              x="570"
              y="10"
              width="100"
              height="40"
              fill="#388e3c"
              rx="5"
            />
            <text x="580" y="35" fontSize="12">
              {language === "ko" ? "키" : "Keys"}
            </text>
            <path d="M670 30 H710" stroke="gray" />
            <rect
              x="710"
              y="10"
              width="100"
              height="40"
              fill="#d4a5a5"
              rx="5"
            />
            <text x="720" y="35" fontSize="12">
              {language === "ko" ? "주소" : "Address"}
            </text>
          </svg>
        </div>
      </CardContent>
    </Card>
  );

  const getClassName = (label: string) =>
    label === "Entropy"
      ? "entropy"
      : label === "Checksum"
      ? "checksum"
      : label === "Mnemonic Phrase"
      ? "seed-step"
      : label === "Seed"
      ? "seed"
      : label === "Master Private Key" ||
        label.startsWith("Derived Private Key") ||
        label === "Public Key"
      ? "key"
      : label === "Keccak-256 Hash"
      ? "hash"
      : "address";

  const getEmoji = (index: number) =>
    ["🔧", "✔️", "📜", "🌱", "🔐", "🔑", "🔍", "✂️", "✅", "🏁"][index % 10];

  return (
    <DndProvider backend={HTML5Backend}>
      <Analytics />
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <style>{styles}</style>
        <Card className="w-full max-w-2xl shadow-md">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>
                {language === "ko"
                  ? "EVM 지갑 생성 과정"
                  : "EVM Wallet Creation Process"}
              </CardTitle>
              <div className="flex gap-2">
                <Toggle
                  pressed={language === "ko"}
                  onPressedChange={() => setLanguage("ko")}
                  variant="outline"
                >
                  한국어
                </Toggle>
                <Toggle
                  pressed={language === "en"}
                  onPressedChange={() => setLanguage("en")}
                  variant="outline"
                >
                  English
                </Toggle>
              </div>
            </div>
            <Progress value={(step / 7) * 100} className="mt-2" />
            <p className="text-sm text-gray-600 mt-2">
              {language === "ko"
                ? `현재 단계: ${
                    step > 0 ? stepDescriptionsKo[step - 1] : "시작 안 함"
                  }`
                : `Current Step: ${
                    step > 0 ? stepDescriptionsEn[step - 1] : "Not Started"
                  }`}
            </p>
            <Button onClick={resetAll} variant="outline" className="mt-2">
              {language === "ko" ? "다시 시작" : "Reset"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              {(language === "ko"
                ? stepDescriptionsKo
                : stepDescriptionsEn
              ).map((desc, index) => (
                <Card
                  key={index}
                  className={`input-card ${
                    index <= step ? "bg-blue-50" : "opacity-50"
                  } shadow-md`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <span className="mr-2 text-lg">{getEmoji(index)}</span>
                        <span className="text-sm font-semibold">{desc}</span>
                      </div>
                      <ul className="details-list text-sm text-gray-600">
                        {(language === "ko" ? stepDetailsKo : stepDetailsEn)[
                          index
                        ].map((detail, idx) => (
                          <li key={idx}>{detail}</li>
                        ))}
                      </ul>
                      <p className="guide-text">
                        {language === "ko"
                          ? onboardingGuidesKo[index]
                          : onboardingGuidesEn[index]}
                      </p>
                      {index === 0 && (
                        <div className="mt-2 space-y-2">
                          <Button
                            onClick={() => handleStepClick(0)}
                            disabled={index > step}
                          >
                            {language === "ko"
                              ? "예시 생성"
                              : "Generate Example"}
                          </Button>
                          {mnemonicWords.length > 0 && (
                            <div className="interactive-box">
                              <p>
                                {language === "ko"
                                  ? "단어를 드래그해 나만의 니모닉을 만드세요:"
                                  : "Drag words to create your own mnemonic:"}
                              </p>
                              <div className="drop-zone">
                                {mnemonicWords.map((word, idx) => (
                                  <DraggableWord
                                    key={idx}
                                    word={word}
                                    index={idx}
                                    moveWord={moveWord}
                                  />
                                ))}
                              </div>
                              <Button
                                onClick={handleMnemonicComplete}
                                className="mt-2"
                              >
                                {language === "ko" ? "완성" : "Complete"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {index === 1 && (
                        <div className="mt-2 space-y-2">
                          <Toggle
                            pressed={useCustomPath}
                            onPressedChange={setUseCustomPath}
                            variant="outline"
                          >
                            {language === "ko"
                              ? "사용자 정의 경로"
                              : "Custom Path"}
                          </Toggle>
                          {useCustomPath ? (
                            <Input
                              placeholder={
                                language === "ko"
                                  ? "경로 입력 (예: m/44'/60'/0'/0/0)"
                                  : "Enter Path (e.g., m/44'/60'/0'/0/0)"
                              }
                              value={customPath}
                              onChange={(e) => setCustomPath(e.target.value)}
                            />
                          ) : (
                            <div className="interactive-box">
                              <p>
                                {language === "ko"
                                  ? "경로 조각을 클릭해 선택:"
                                  : "Click path segments to select:"}
                              </p>
                              {["44'", "60'", "0'", "0", "1"].map((segment) => (
                                <span
                                  key={segment}
                                  className={`selectable-word ${
                                    pathSegments.includes(segment)
                                      ? "selected-word"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    handlePathSegmentClick(segment)
                                  }
                                >
                                  {segment}
                                </span>
                              ))}
                            </div>
                          )}
                          <Button
                            onClick={() => handleStepClick(1)}
                            disabled={index > step}
                          >
                            {language === "ko" ? "파생" : "Derive"}
                          </Button>
                        </div>
                      )}
                      {index === 2 && (
                        <div className="mt-2 space-y-2">
                          <div className="interactive-box">
                            <p>
                              {language === "ko"
                                ? "개인 키에서 공개 키로 변환 중:"
                                : "Converting private key to public key:"}
                            </p>
                            <p className="font-mono text-sm result-preview">
                              {publicKeyPreview ||
                                (privateKey
                                  ? privateKey.slice(0, 10) + "..."
                                  : "")}
                            </p>
                          </div>
                          <Button
                            onClick={() => handleStepClick(2)}
                            disabled={index > step}
                          >
                            {language === "ko"
                              ? "변환 시작"
                              : "Start Conversion"}
                          </Button>
                        </div>
                      )}
                      {index === 3 && (
                        <div className="mt-2 space-y-2">
                          <div className="interactive-box">
                            <p>
                              {language === "ko"
                                ? "슬라이더로 해시 길이 조정 (64 이상):"
                                : "Adjust hash length with slider (64+):"}
                            </p>
                            <input
                              type="range"
                              min="0"
                              max="128"
                              value={hashLength}
                              onChange={handleHashLengthChange}
                              className="w-full"
                            />
                            <p className="font-mono text-sm">
                              {results[7]
                                ?.split(": ")[1]
                                ?.slice(0, hashLength / 2) || ""}
                            </p>
                          </div>
                          <Button
                            onClick={handleFinishHashCreation}
                            disabled={index > step || hashLength < 64}
                          >
                            {language === "ko"
                              ? "해시 생성 완료"
                              : "Finish Hash Creation"}
                          </Button>
                          {hashLength < 64 && (
                            <p className="warning-text">
                              {language === "ko"
                                ? "슬라이더를 64 이상으로 설정하세요!"
                                : "Set the slider to 64 or more!"}
                            </p>
                          )}
                        </div>
                      )}
                      {index === 4 && (
                        <div className="mt-2 space-y-2">
                          <div className="interactive-box">
                            <p>
                              {language === "ko"
                                ? "해시에서 추출될 주소:"
                                : "Address to be extracted from hash:"}
                            </p>
                            <p className="font-mono text-sm">
                              {results[7]?.split(": ")[1].slice(0, -40)}
                              <span className="address-highlight">
                                {results[7]?.split(": ")[1].slice(-40)}
                              </span>
                            </p>
                          </div>
                          <Button
                            onClick={() => handleStepClick(4)}
                            disabled={index > step || !results[7]}
                          >
                            {language === "ko"
                              ? "주소 추출"
                              : "Extract Address"}
                          </Button>
                          {!results[7] && (
                            <p className="warning-text">
                              {language === "ko"
                                ? "먼저 해시를 생성해주세요!"
                                : "Please create the hash first!"}
                            </p>
                          )}
                        </div>
                      )}
                      {index === 5 && (
                        <div className="mt-2 space-y-2">
                          <div className="interactive-box">
                            <p>
                              {language === "ko"
                                ? "체크섬 적용 여부:"
                                : "Apply checksum?"}
                            </p>
                            <Toggle
                              pressed={applyChecksum}
                              onPressedChange={handleChecksumToggle}
                            >
                              {language === "ko" ? "적용" : "Apply"}
                            </Toggle>
                            <p className="font-mono text-sm">
                              {applyChecksum
                                ? results[9]?.split(": ")[1]
                                : results[8]?.split(": ")[1]}
                            </p>
                          </div>
                          <Button
                            onClick={handleFinishChecksumApplication}
                            disabled={index > step || !applyChecksum}
                          >
                            {language === "ko"
                              ? "체크섬 적용 완료"
                              : "Finish Checksum Application"}
                          </Button>
                          {!applyChecksum && (
                            <p className="warning-text">
                              {language === "ko"
                                ? "체크섬 토글을 켜주세요!"
                                : "Please turn on the checksum toggle!"}
                            </p>
                          )}
                        </div>
                      )}
                      {index === 6 && (
                        <div className="mt-2 space-y-2">
                          <Button
                            onClick={() => handleStepClick(6)}
                            disabled={index > step || !results[9]}
                          >
                            {language === "ko" ? "포장" : "Wrap"}
                          </Button>
                          {!results[9] && (
                            <p className="warning-text">
                              {language === "ko"
                                ? "먼저 체크섬 주소를 적용해주세요!"
                                : "Please apply the checksum address first!"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {results.length > 0 && (
              <div className="space-y-4 mt-4">
                <div className="flex gap-2">
                  <Button
                    onClick={() => toggleAccordion(true)}
                    variant="outline"
                  >
                    {language === "ko" ? "모두 펼치기" : "Expand All"}
                  </Button>
                  <Button
                    onClick={() => toggleAccordion(false)}
                    variant="outline"
                  >
                    {language === "ko" ? "모두 접기" : "Collapse All"}
                  </Button>
                </div>
                <Accordion
                  type="multiple"
                  value={accordionValue}
                  onValueChange={setAccordionValue}
                  className="space-y-2"
                >
                  {results.map((result, index) => {
                    const [label, value] = result.split(": ");
                    const isActive = index === results.length - 1;
                    return (
                      <AccordionItem key={index} value={`item-${index}`}>
                        <AccordionTrigger
                          className={`result-card ${getClassName(label)} ${
                            isActive ? "active-step" : ""
                          } ${
                            highlightedIndex === index ? "highlight" : ""
                          } shadow-md p-4`}
                        >
                          <div className="flex items-center">
                            <span className="mr-2">{getEmoji(index)}</span>
                            <span>{label}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent
                          className="p-4"
                          ref={(el) => {
                            resultRefs.current[index] = el;
                          }}
                        >
                          {label === "Mnemonic Phrase" &&
                          entropy &&
                          checksum ? (
                            renderMnemonicBits(value, entropy, checksum)
                          ) : label === "Checksum Address" ? (
                            renderChecksumProcess(
                              results[8].split(": ")[1],
                              keccak256(
                                results[8].split(": ")[1] as `0x${string}`
                              )
                            )
                          ) : (
                            <div className="text-sm text-gray-600 mt-1">
                              {renderHexBlocks(value, getClassName(label))}{" "}
                              <span
                                className={`font-mono ${
                                  label === "Mnemonic Phrase"
                                    ? "mnemonic-phrase"
                                    : "address-full"
                                }`}
                              >
                                {value}
                              </span>
                              {label.startsWith("Derived Private Key") &&
                                index === 5 &&
                                renderDerivationVisualization()}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}
            {step > 0 && (
              <Button
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                className="mt-4"
                variant="outline"
              >
                {language === "ko" ? "뒤로" : "Back"}
              </Button>
            )}
            {step === 7 && (
              <Card className="mt-4 shadow-md">
                <CardContent className="p-4">
                  <p className="text-sm text-green-600 flex items-center">
                    <span className="mr-2">🎉</span>{" "}
                    {language === "ko"
                      ? "지갑 생성 완료!"
                      : "Wallet creation completed!"}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {language === "ko" ? "프로세스 개요" : "Process Overview"}
                  </h3>
                  {renderFlowDiagramScrollable()}
                </CardContent>
              </Card>
            )}
            {step > 0 && (
              <Button
                onClick={scrollToTop}
                className="float-button"
                variant="outline"
              >
                {language === "ko" ? "위로" : "Top"}
              </Button>
            )}
          </CardContent>
          <CardFooter className="footer">
            <p className="text-sm">
              {language === "ko" ? "Grok3로 제작됨" : "Built with Grok3"}· 2025{" "}
              <a
                className="text-blue-500 hover:underline"
                href="https://x.com/dilrong_"
                target="_blank"
                rel="noopener noreferrer"
              >
                with Dilrong
              </a>
            </p>
          </CardFooter>
        </Card>
      </div>
    </DndProvider>
  );
}

export default App;
