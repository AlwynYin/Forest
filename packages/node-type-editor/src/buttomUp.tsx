import * as React from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import {NodeM, NodeVM} from "@forest/schema";
import {EditorNodeType} from ".";
import {stageThisVersion} from "@forest/schema/src/stageService";
import {useAtomValue} from "jotai";
import { authTokenAtom } from "@forest/user-system/src/authStates";
import {NormalMessage} from "@forest/agent-chat/src/MessageTypes";
import {fetchChatResponse} from "@forest/agent-chat/src/llm";
import {Card} from "@mui/material";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import SummarizeIcon from '@mui/icons-material/Summarize';


export const BottomUpButton: React.FC<{ node: NodeVM}> = ({node}) => {
    const [loading, setLoading] = React.useState(false);
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [originalContent, setOriginalContent] = React.useState<string | null>(null);
    const [revisedContent, setRevisedContent] = React.useState<string | null>(null);
    const authToken = useAtomValue(authTokenAtom)

    const handleClick = async () => {
        setLoading(true);
        try {
            const editorNodeType = await node.nodeM.treeM.supportedNodesTypes("EditorNodeType") as EditorNodeType;
            const original = editorNodeType.getEditorContent(node.nodeM);
            const revised = await getBottomUpRevisedContent(node.nodeM, authToken);

            setOriginalContent(original);
            setRevisedContent(revised);
            setDialogOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setOriginalContent(null);
        setRevisedContent(null);
    };

    const handleAccept = async () => {
        await stageThisVersion(node, "Before bottom-up editing");
        if (revisedContent) {
            const editorNodeType = await node.nodeM.treeM.supportedNodesTypes("EditorNodeType") as EditorNodeType;
            editorNodeType.setEditorContent(node.nodeM, revisedContent);
        }
        handleCloseDialog();
    };

    return (
        <>
            <Card
                sx={{
                    cursor: 'pointer',
                    boxShadow: 3,
                    '&:hover': {
                        boxShadow: 6,
                        transform: 'translateY(-2px)'
                    },
                    transition: 'all 0.2s ease-in-out',
                    margin: "10px 0",
                    borderRadius: "10px"
                }}
                onClick={handleClick}
            >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <SummarizeIcon color="primary" />
                    <div>
                        <Typography variant="body1" component="div">
                            Summerize from children
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                            Update key points based on children contents
                        </Typography>
                    </div>
                    {loading && <CircularProgress size={20} />}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="lg" fullWidth>
                <DialogTitle>Review Changes</DialogTitle>
                <DialogContent sx={{display: 'flex', gap: '20px'}}>
                    <div style={{
                        flex: 1,
                        overflow: 'auto',
                        border: '1px solid #ccc',
                        padding: '10px',
                        borderRadius: '4px'
                    }}>
                        <h3>Original</h3>
                        <div dangerouslySetInnerHTML={{ __html: originalContent ?? "" }} />
                    </div>
                    <div style={{
                        flex: 1,
                        overflow: 'auto',
                        border: '1px solid #ccc',
                        padding: '10px',
                        borderRadius: '4px'
                    }}>
                        <h3>Revised</h3>
                        <div dangerouslySetInnerHTML={{ __html: revisedContent ?? "" }} />
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleAccept} color="primary">Accept</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

async function getBottomUpRevisedContent(node: NodeM, authToken): Promise<string> {
    const treeM = node.treeM;
    const children = treeM.getChildren(node).filter((n) => n.nodeTypeName() === "EditorNodeType");
    const editorNodeType = await treeM.supportedNodesTypes("EditorNodeType") as EditorNodeType;
    const childrenContent = children.map(child => "# " + child.title() + "\n" + editorNodeType.getEditorContent(child)).join("\n");
    const orginalContent = editorNodeType.getEditorContent(node);
    const prompt = `You are a professional editor. The given original text is a summary of some children contents. 
Your task is to revise the original context to make it serve as a better summary of the children contents.
<original_content>
${orginalContent}
</original_content>
<children_contents>
${childrenContent}
</children_contents>
Please provide an updated version of the original text in key points. You should not make unnecessary changes to the original text.
<output_format>
You should only return the HTML content of the revised text without any additional text or formatting.
You are required to make a list of key points by <ul></ul>
You should make no more than 5 key points. Each key point should be less than 20 words.
If there are any annotations in the original text, you should keep them as they are.
</output_format>
`;
    const message = new NormalMessage(
        {
            content: prompt,
            author: "user",
            role: "user",
            time: new Date().toISOString()
        }
    )
    const response = await fetchChatResponse([message.toJson() as any], "gpt-4.1", authToken);
    return response;
}