export namespace main {
	
	export class AICompletionResponse {
	    Content: string;
	
	    static createFrom(source: any = {}) {
	        return new AICompletionResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Content = source["Content"];
	    }
	}
	export class CanvasFileResult {
	    success: boolean;
	    path?: string;
	    data?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new CanvasFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.path = source["path"];
	        this.data = source["data"];
	        this.error = source["error"];
	    }
	}
	export class ClipboardResult {
	    success: boolean;
	    data?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ClipboardResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.data = source["data"];
	        this.error = source["error"];
	    }
	}
	export class Model {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new Model(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class RecentCanvas {
	    name: string;
	    path: string;
	    lastOpened: number;
	
	    static createFrom(source: any = {}) {
	        return new RecentCanvas(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.lastOpened = source["lastOpened"];
	    }
	}
	export class RecentCanvasesResult {
	    success: boolean;
	    recents?: RecentCanvas[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentCanvasesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.recents = this.convertValues(source["recents"], RecentCanvas);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

