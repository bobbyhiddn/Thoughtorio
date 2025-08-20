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

}

