declare module 'react-quill-new' {
    import { Component } from 'react';
    export interface ReactQuillProps {
        bounds?: string | HTMLElement;
        children?: React.ReactElement<any>;
        className?: string;
        defaultValue?: string | { ops: any[] };
        formats?: string[];
        id?: string;
        modules?: any;
        onChange?: (content: string, delta: any, source: string, editor: any) => void;
        onChangeSelection?: (range: any, source: string, editor: any) => void;
        onFocus?: (range: any, source: string, editor: any) => void;
        onBlur?: (previousRange: any, source: string, editor: any) => void;
        onKeyPress?: React.EventHandler<any>;
        onKeyDown?: React.EventHandler<any>;
        onKeyUp?: React.EventHandler<any>;
        placeholder?: string;
        preserveWhitespace?: boolean;
        readOnly?: boolean;
        scrollingContainer?: string | HTMLElement;
        style?: React.CSSProperties;
        tabIndex?: number;
        theme?: string;
        value?: string | { ops: any[] };
    }
    export default class ReactQuill extends Component<ReactQuillProps> { }
}
